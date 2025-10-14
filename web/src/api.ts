import type { ChatListCursor, ChatListResponse, ChatMessage, ChatSummary } from './types';

const defaultApiBase = 'http://localhost:4000';
const apiBase =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? defaultApiBase;

const buildUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBase}${normalizedPath}`;
};

interface ApiEnvelope<T> {
  data: T;
  error?: unknown;
}

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (payload.error) {
    throw new Error(String(payload.error));
  }

  return payload.data;
};

interface FetchChatSummariesOptions {
  search?: string;
  sessionId?: string;
  limit?: number;
}

export const fetchChatSummaries = async (
  options: FetchChatSummariesOptions
): Promise<ChatSummary[]> => {
  const url = new URL(buildUrl('/api/chats'));

  if (options.search) {
    url.searchParams.set('search', options.search);
  }

  if (options.sessionId) {
    url.searchParams.set('sessionId', options.sessionId);
  }

  if (options.limit != null) {
    url.searchParams.set('limit', String(options.limit));
  }

  const response = await fetch(url.toString());
  return handleResponse<ChatSummary[]>(response);
};

export const fetchChatMessages = async (sessionId: string): Promise<ChatMessage[]> => {
  const response = await fetch(buildUrl(`/api/chats/${encodeURIComponent(sessionId)}/messages`));
  return handleResponse<ChatMessage[]>(response);
};

interface FetchChatListOptions {
  limit?: number;
  cursor?: ChatListCursor | null;
  search?: string;
}

export const fetchChatList = async (
  options: FetchChatListOptions = {}
): Promise<ChatListResponse> => {
  const url = new URL(buildUrl('/api/chats/list'));

  if (options.limit != null) {
    url.searchParams.set('limit', String(options.limit));
  }

  if (options.cursor?.lastMessageAt) {
    url.searchParams.set('cursorLastMessageAt', options.cursor.lastMessageAt);
  }

  if (options.cursor?.sessionId) {
    url.searchParams.set('cursorSessionId', options.cursor.sessionId);
  }

  if (options.search) {
    url.searchParams.set('search', options.search);
  }

  const response = await fetch(url.toString());
  return handleResponse<ChatListResponse>(response);
};
