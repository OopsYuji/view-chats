-- Minimal schema for chat viewer data model.

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  message JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time
  ON chat_messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS visitors_settings (
  session_id TEXT PRIMARY KEY,
  is_whatsapp BOOLEAN NOT NULL DEFAULT false,
  type TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
