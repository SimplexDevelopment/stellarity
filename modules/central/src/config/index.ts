import path from 'path';

// Bun automatically loads .env from the working directory.
// No dotenv import needed.

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || '3001'}`,

  // Database
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'stellarity',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  },



  // JWT Signing (Ed25519 / EdDSA)
  jwt: {
    // Key files are stored in data/ directory
    keyDir: process.env.JWT_KEY_DIR || path.resolve(__dirname, '../../data'),
    accessTokenTTL: process.env.JWT_ACCESS_TTL || '100y', // Permanent sessions
    refreshTokenTTL: process.env.JWT_REFRESH_TTL || '100y',
  },

  // Encryption (for DM buffer, etc.)
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'default-32-byte-key-for-dev-only!',
  },

  // CORS
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()),
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10),
    authWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10),
    authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '20', 10),
  },

  // MFA
  mfa: {
    issuer: process.env.MFA_ISSUER || 'Stellarity',
  },

  // DM Buffer
  dm: {
    bufferTTLDays: parseInt(process.env.DM_BUFFER_TTL_DAYS || '30', 10),
    maxPendingPerUser: parseInt(process.env.DM_MAX_PENDING_PER_USER || '1000', 10),
  },
};
