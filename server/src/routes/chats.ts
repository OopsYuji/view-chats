import { Router } from 'express';
import { config } from '../config';
import { query } from '../db';
import type { ChatMessage, ChatMessagePayload, ChatSummary } from '../types';

const router = Router();
const chatTable = config.chatTableSql;
const DEFAULT_SUMMARY_LIMIT = 25;
const MAX_SUMMARY_LIMIT = 200;
const MIN_SEARCH_LENGTH = 3;

const escapeForILike = (input: string) => input.replace(/([_%\\])/g, '\\$1');

const parseLimit = (rawLimit: unknown) => {
  if (typeof rawLimit !== 'string') {
    return DEFAULT_SUMMARY_LIMIT;
  }

  const parsed = Number.parseInt(rawLimit, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SUMMARY_LIMIT;
  }

  return Math.min(Math.max(parsed, 1), MAX_SUMMARY_LIMIT);
};

router.get('/', async (req, res, next) => {
  const sessionIdQuery =
    typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : undefined;
  const searchQuery =
    typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const limit = parseLimit(req.query.limit);

  try {
    if (sessionIdQuery) {
      const result = await query<{
        session_id: string;
        message_count: string;
        last_message_content: string | null;
        last_message_type: string | null;
        last_message_at: Date | null;
      }>(
        `
          SELECT
            session_id,
            COUNT(*) AS message_count,
            MAX(created_at) AS last_message_at,
            (ARRAY_AGG(message ->> 'content' ORDER BY created_at DESC))[1] AS last_message_content,
            (ARRAY_AGG(message ->> 'type' ORDER BY created_at DESC))[1] AS last_message_type
          FROM ${chatTable}
          WHERE session_id = $1
          GROUP BY session_id
        `,
        [sessionIdQuery]
      );

      const chats: ChatSummary[] = result.rows.map((row) => ({
        sessionId: row.session_id,
        lastMessagePreview: row.last_message_content,
        lastMessageType: row.last_message_type,
        lastMessageAt: row.last_message_at ? row.last_message_at.toISOString() : null,
        messageCount: Number(row.message_count) || 0
      }));

      res.json({ data: chats });
      return;
    }

    if (!searchQuery) {
      res.status(400).json({
        error: 'Provide a sessionId or search query to look up chat summaries.'
      });
      return;
    }

    if (searchQuery.length < MIN_SEARCH_LENGTH) {
      res.status(400).json({
        error: `Search query must be at least ${MIN_SEARCH_LENGTH} characters long.`
      });
      return;
    }

    const searchPattern = `${escapeForILike(searchQuery)}%`;

    const result = await query<{
      session_id: string;
      message_count: string;
      last_message_content: string | null;
      last_message_type: string | null;
      last_message_at: Date | null;
    }>(
      `
        WITH session_stats AS (
          SELECT
            session_id,
            COUNT(*) AS message_count,
            MAX(created_at) AS last_message_at
          FROM ${chatTable}
          WHERE session_id ILIKE $1
          GROUP BY session_id
        ),
        limited_sessions AS (
          SELECT *
          FROM session_stats
          ORDER BY last_message_at DESC
          LIMIT $2
        ),
        last_messages AS (
          SELECT
            session_id,
            message,
            created_at
          FROM ${chatTable}
          WHERE session_id IN (SELECT session_id FROM limited_sessions)
          ORDER BY session_id, created_at DESC
        ),
        ranked_last_messages AS (
          SELECT
            session_id,
            message,
            created_at,
            ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC) AS row_num
          FROM last_messages
        )
        SELECT
          ls.session_id,
          ls.message_count,
          ls.last_message_at,
          rlm.message ->> 'content' AS last_message_content,
          rlm.message ->> 'type' AS last_message_type
        FROM limited_sessions ls
        JOIN ranked_last_messages rlm ON rlm.session_id = ls.session_id
        WHERE rlm.row_num = 1
        ORDER BY ls.last_message_at DESC
      `,
      [searchPattern, limit]
    );

    const chats: ChatSummary[] = result.rows.map((row) => ({
      sessionId: row.session_id,
      lastMessagePreview: row.last_message_content,
      lastMessageType: row.last_message_type,
      lastMessageAt: row.last_message_at ? row.last_message_at.toISOString() : null,
      messageCount: Number(row.message_count) || 0
    }));

    res.json({ data: chats });
  } catch (error) {
    next(error);
  }
});

router.get('/:sessionId/messages', async (req, res, next) => {
  const { sessionId } = req.params;

  try {
    const result = await query<{
      id: string;
      session_id: string;
      message: unknown;
      created_at: Date;
    }>(
      `
        SELECT id, session_id, message, created_at
        FROM ${chatTable}
        WHERE session_id = $1
        ORDER BY created_at ASC
      `,
      [sessionId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Chat session not found' });
      return;
    }

    const messages: ChatMessage[] = result.rows.map((row) => {
      const payload = row.message as ChatMessagePayload;

      return {
        id: row.id,
        sessionId: row.session_id,
        createdAt: row.created_at.toISOString(),
        payload
      };
    });

    res.json({ data: messages });
  } catch (error) {
    next(error);
  }
});

export default router;
