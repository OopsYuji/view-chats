export type ChatAuthorType = 'ai' | 'human' | 'system' | string;

export interface ChatSummary {
  sessionId: string;
  lastMessagePreview: string | null;
  lastMessageType: ChatAuthorType | null;
  lastMessageAt: string | null;
  messageCount: number;
}

export interface ChatMessagePayload {
  type: ChatAuthorType;
  content: unknown;
  tool_calls?: unknown[];
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
  invalid_tool_calls?: unknown[];
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  createdAt: string;
  payload: ChatMessagePayload;
}
