import cors from 'cors';
import express, { ErrorRequestHandler } from 'express';
import { config } from './config';
import { disconnect } from './db';
import { requireAuth } from './middleware/auth';
import chatsRouter from './routes/chats';

const app = express();

if (config.corsOrigins) {
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true
    })
  );
} else {
  app.use(cors());
}

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/chats', requireAuth, chatsRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // Avoid leaking implementation details while still giving a hint in the logs.
  console.error('[api] Unhandled error', error);
  res.status(500).json({ error: 'Internal server error' });
};

app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});

const gracefulShutdown = async () => {
  console.log('Received shutdown signal, closing HTTP server...');

  server.close(async (closeError) => {
    if (closeError) {
      console.error('Error while closing HTTP server', closeError);
    }

    try {
      await disconnect();
      console.log('Database connections closed. Bye!');
    } catch (dbError) {
      console.error('Error while closing database connections', dbError);
    } finally {
      process.exit(closeError ? 1 : 0);
    }
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
