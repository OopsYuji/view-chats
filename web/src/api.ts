import type { ChatMessage, ChatSummary } from './types';

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

export const fetchChatSummaries = async (): Promise<ChatSummary[]> => {
  const response = await fetch(buildUrl('/api/chats'));
  return handleResponse<ChatSummary[]>(response);
};

export const fetchChatMessages = async (sessionId: string): Promise<ChatMessage[]> => {
  const response = await fetch(buildUrl(`/api/chats/${encodeURIComponent(sessionId)}/messages`));
  return handleResponse<ChatMessage[]>(response);
};
