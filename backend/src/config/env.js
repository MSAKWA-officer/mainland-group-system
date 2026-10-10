require('dotenv').config();

const need = (k) => {
  if (!process.env[k]) {
    throw new Error(`Missing required env var ${k}`);
  }
  return process.env[k];
};

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 4000,

  // PostgreSQL
  DB_HOST: need('DB_HOST'),
  DB_PORT: Number(process.env.DB_PORT) || 5432,
  DB_NAME: need('DB_NAME'),
  DB_USER: need('DB_USER'),
  DB_PASSWORD: need('DB_PASSWORD'),
  DB_SSL: process.env.DB_SSL === 'true',

  // Authentication
  JWT_SECRET: need('JWT_SECRET'),
  ENCRYPTION_KEY: need('ENCRYPTION_KEY'),

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // SSL
  SSL_KEY_PATH: process.env.SSL_KEY_PATH,
  SSL_CERT_PATH: process.env.SSL_CERT_PATH,

  // Storage
  UPLOAD_DIR: process.env.UPLOAD_DIR || './storage/uploads',
  BACKUP_DIR: process.env.BACKUP_DIR || './storage/backups',
  BACKUP_RETENTION_DAYS:
    Number(process.env.BACKUP_RETENTION_DAYS) || 30,

  // Authentication settings
  ACCESS_TTL: '15m',
  REFRESH_TTL_MS: 7 * 24 * 3600 * 1000,
  MAX_FAILED_LOGINS: 5,
  LOCK_MINUTES: 15,
};

env.isProd = env.NODE_ENV === 'production';

if (env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

if (!/^[0-9a-f]{64}$/i.test(env.ENCRYPTION_KEY)) {
  throw new Error('ENCRYPTION_KEY must be 64 hex characters');
}

if (env.isProd && /^0+$/.test(env.ENCRYPTION_KEY)) {
  throw new Error('Set a real ENCRYPTION_KEY in production');
}

module.exports = env;