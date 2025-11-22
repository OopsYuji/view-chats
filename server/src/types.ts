export type ChatAuthorType = 'ai' | 'human' | 'system' | string;

export interface ChatSummary {
  sessionId: string;
  lastMessagePreview: string | null;
  lastMessageType: ChatAuthorType | null;
  lastMessageAt: string | null;
  messageCount: number;
  isSales: boolean;
  isWhatsapp: boolean;
}

export interface ChatMessagePayload {
  type: ChatAuthorType;
  content: string | null;
  tool_calls?: unknown;
  additional_kwargs?: unknown;
  response_metadata?: unknown;
  invalid_tool_calls?: unknown;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  createdAt: string;
  payload: ChatMessagePayload;
}

export interface ChatListItem {
  sessionId: string;
  lastMessageAt: string | null;
  messageCount: number;
  isSales: boolean;
  isWhatsapp: boolean;
}

export interface ChatListCursor {
  lastMessageAt: string;
  sessionId: string;
}

export interface ChatListResponse {
  items: ChatListItem[];
  nextCursor?: ChatListCursor;
}
