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

  CREATE TABLE visitors_settings (
    session_id TEXT PRIMARY KEY,
    is_whatsapp BOOLEAN NOT NULL DEFAULT false,
    type TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ```

### Setup

1. From the repo root run `npm install` (installs both server and web workspaces).
2. `npm run dev` starts the API at `http://localhost:4000` and the React client at `http://localhost:5173` concurrently.
3. Open the web UI (`http://localhost:5173`), enter a session id, and press **Find** to load messages (nothing is fetched until you run a search).

### Backend (`server`)

1. Copy `.env.example` (repository root) to `.env` and configure database access. Fill in `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD`. Hosted providers like Supabase require `PGSSLMODE=require` (and often `PGSSLREJECTUNAUTHORIZED=false`). Optionally set `CHAT_TABLE` / `VISITOR_SETTINGS_TABLE` if you store messages in different table names, and `CORS_ORIGIN` with comma-separated origins (e.g. `http://localhost:5173`). Authentication requires `GOOGLE_CLIENT_ID` (the OAuth client ID from Google Identity Services).
2. The workspace-specific commands are still available if needed: `npm run dev --workspace server`, `npm run build --workspace server`, etc.

Endpoints:

- `GET /health`
- `GET /api/chats` - chat session summaries (grouped by `session_id`)
- `GET /api/chats/:sessionId/messages` - ordered messages for a session

### Frontend (`web`)

- Launched automatically via `npm run dev`. You can also run workspace commands directly (`npm run dev --workspace web`).
- Ensure the API base URL matches `http://localhost:4000` (configure via the shared `.env` using `VITE_API_BASE_URL`). Google Sign-In needs `VITE_GOOGLE_CLIENT_ID` (must match `GOOGLE_CLIENT_ID` in the same `.env`).
- Use the search bar (type a session id and click **Find**) to fetch data on demand. The Refresh button re-runs the most recent search. Sales chats (from `visitors_settings.type = 'sales'`) or WhatsApp chats (session ids that look like `abc_def`) can be filtered via the sidebar toggles; enabling both requires `visitors_settings.type = 'sales'` and `visitors_settings.is_whatsapp = true`. Each message includes a toggle to reveal the raw JSON payload.

### Authentication

- The UI loads Google Identity Services in-browser and only enables chat browsing after a successful Google sign-in.
- ID tokens are forwarded to the backend via `Authorization: Bearer …` headers. The API validates each token via Google, confirms the `aud` matches `GOOGLE_CLIENT_ID`, and allows whichever Google accounts you authorize through GIS.
- Sign out clears the cached ID token and disables auto-select on the Google button so users can switch accounts easily.

### Notes

- The backend intentionally treats `session_id` as the chat identifier.
- `message` JSON is surfaced unchanged so you can inspect any custom fields.
- Adjust styling or layouts inside `web/src/styles.css` as needed.
