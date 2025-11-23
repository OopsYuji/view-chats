import { Pool } from 'pg';
import { assertDatabaseConfig, config } from './config';

assertDatabaseConfig();

const connectionOptions = {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password
};

export const pool = new Pool({
  ...connectionOptions,
  ...(config.db.ssl !== undefined ? { ssl: config.db.ssl } : {}),
  max: 10,
  idleTimeoutMillis: 30_000
});

export const query = <T>(text: string, params?: unknown[]) => pool.query<T>(text, params);

export const disconnect = async () => {
  await pool.end();
};
