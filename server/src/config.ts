import path from 'path';
import dotenv from 'dotenv';

const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
dotenv.config({ path: rootEnvPath });
dotenv.config();

const parsePort = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeEnv = (value: string | undefined) => {
  if (value == null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseOrigins = (value: string | undefined): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : undefined;
};

const sanitizeIdentifierPart = (part: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) {
    throw new Error(
      `Invalid identifier segment "${part}". Use alphanumeric characters or underscores, starting with a letter or underscore.`
    );
  }

  return `"${part.replace(/"/g, '""')}"`;
};

const parseTableName = (value: string | undefined, fallback: string) => {
  const source = value?.trim() || fallback;

  const parts = source
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error('CHAT_TABLE must not be empty when provided.');
  }

  const quoted = parts.map(sanitizeIdentifierPart).join('.');

  return {
    raw: parts.join('.'),
    sql: quoted
  };
};

const chatTable = parseTableName(
  normalizeEnv(process.env.CHAT_TABLE ?? process.env.CHAT_TABLE_NAME),
  'chat_messages'
);

const visitorSettingsTable = parseTableName(
  normalizeEnv(process.env.VISITOR_SETTINGS_TABLE ?? process.env.VISITORS_SETTINGS_TABLE),
  'visitors_settings'
);

const googleClientId = normalizeEnv(process.env.GOOGLE_CLIENT_ID);

if (!googleClientId) {
  throw new Error('GOOGLE_CLIENT_ID is required for authentication.');
}

const googleAllowedDomain = normalizeEnv(process.env.GOOGLE_ALLOWED_DOMAIN) ?? 'kiv.chat';

type SslConfig = false | { rejectUnauthorized?: boolean };

const parseBoolean = (value: string | undefined) => {
  if (value == null) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
};

const parseSslConfig = (): SslConfig | undefined => {
  const modeRaw = normalizeEnv(process.env.PGSSLMODE ?? process.env.PGSSL);
  const rejectUnauthorizedFlag = parseBoolean(normalizeEnv(process.env.PGSSLREJECTUNAUTHORIZED));

  if (!modeRaw) {
    return rejectUnauthorizedFlag === undefined
      ? undefined
      : { rejectUnauthorized: rejectUnauthorizedFlag };
  }

  const mode = modeRaw.trim().toLowerCase();

  switch (mode) {
    case 'disable':
    case 'off':
    case 'false':
    case '0':
      return false;
    case 'require':
    case 'prefer':
      return { rejectUnauthorized: rejectUnauthorizedFlag ?? false };
    case 'verify-ca':
    case 'verify-full':
    case 'strict':
    case 'true':
    case '1':
    case 'on':
      return { rejectUnauthorized: rejectUnauthorizedFlag ?? true };
    default:
      throw new Error(
        `Unsupported PGSSLMODE value "${modeRaw}". Supported values: disable, require, verify-ca, verify-full.`
      );
  }
};

export const config = {
  port: parsePort(process.env.PORT, 4000),
  databaseUrl: normalizeEnv(process.env.DATABASE_URL),
  db: {
    host: normalizeEnv(process.env.PGHOST),
    port: parsePort(process.env.PGPORT, 5432),
    database: normalizeEnv(process.env.PGDATABASE),
    user: normalizeEnv(process.env.PGUSER),
    password: normalizeEnv(process.env.PGPASSWORD),
    ssl: parseSslConfig()
  },
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  chatTable: chatTable.raw,
  chatTableSql: chatTable.sql,
  visitorSettingsTable: visitorSettingsTable.raw,
  visitorSettingsTableSql: visitorSettingsTable.sql,
  auth: {
    googleClientId,
    allowedDomain: googleAllowedDomain
  }
};

export const assertDatabaseConfig = (): void => {
  const hasConnectionUrl = Boolean(config.databaseUrl);
  const hasConnectionFields = Boolean(config.db.host && config.db.database && config.db.user);

  if (!hasConnectionUrl && !hasConnectionFields) {
    throw new Error(
      'Database connection is not configured. Set DATABASE_URL or PGHOST, PGDATABASE, and PGUSER environment variables.'
    );
  }
};
