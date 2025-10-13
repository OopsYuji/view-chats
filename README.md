## Chat Viewer

Simple two-tier TypeScript app for browsing chat sessions stored in PostgreSQL. The backend exposes a small REST API over your existing `chat_messages` table and the frontend lets you search for a session, review the conversation, and inspect each message payload.

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL instance with a `chat_messages` table that matches:
  ```sql
  CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    message JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ```

### Setup

1. From the repo root run `npm install` (installs both server and web workspaces).
2. `npm run dev` starts the API at `http://localhost:4000` and the React client at `http://localhost:5173` concurrently.
3. Open the web UI (`http://localhost:5173`), enter a session id, and press **Find** to load messages (nothing is fetched until you run a search).

### Backend (`server`)

1. Copy `server/.env.example` to `server/.env` and configure database access. Fill in `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD`. Hosted providers like Supabase require `PGSSLMODE=require` (and often `PGSSLREJECTUNAUTHORIZED=false`). Optionally set `CHAT_TABLE` if you store messages in a different table name, and `CORS_ORIGIN` with comma-separated origins (e.g. `http://localhost:5173`).
2. The workspace-specific commands are still available if needed: `npm run dev --workspace server`, `npm run build --workspace server`, etc.

Endpoints:

- `GET /health`
- `GET /api/chats` - chat session summaries (grouped by `session_id`)
- `GET /api/chats/:sessionId/messages` - ordered messages for a session

### Frontend (`web`)

- Launched automatically via `npm run dev`. You can also run workspace commands directly (`npm run dev --workspace web`).
- Ensure the API base URL matches `http://localhost:4000` (override with `web/.env` and `VITE_API_BASE_URL` if necessary).
- Use the search bar (type a session id and click **Find**) to fetch data on demand. The Refresh button re-runs the most recent search. Each message includes a toggle to reveal the raw JSON payload.

### Notes

- The backend intentionally treats `session_id` as the chat identifier.
- `message` JSON is surfaced unchanged so you can inspect any custom fields.
- Adjust styling or layouts inside `web/src/styles.css` as needed.
