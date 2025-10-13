import { Router } from 'express';
import { config } from '../config';
import { query } from '../db';
import type { ChatMessage, ChatMessagePayload, ChatSummary } from '../types';

const router = Router();
const chatTable = config.chatTableSql;

router.get('/', async (_req, res, next) => {
  try {
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
        GROUP BY session_id
        ORDER BY last_message_at DESC
      `
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
