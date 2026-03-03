import path from 'path';

// Bun automatically loads .env from the working directory.
// No dotenv import needed.

/** Parse a TTL string like '15m', '1h', '7d' into milliseconds */
function parseTTLtoMs(ttl: string): number {
  const match = ttl.match(/^(\d+)([smhdy])$/);
  if (!match) return 15 * 60 * 1000; // default 15 min
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'y': return value * 365 * 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
}

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
    accessTokenTTL: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenTTL: process.env.JWT_REFRESH_TTL || '7d',
    accessTokenTTLMs: parseTTLtoMs(process.env.JWT_ACCESS_TTL || '15m'),
  },

  // Encryption (for DM buffer, etc.)
  encryption: {
    key: (() => {
      const key = process.env.ENCRYPTION_KEY;
      if (!key && process.env.NODE_ENV === 'production') {
        throw new Error('ENCRYPTION_KEY must be set in production');
      }
      return key || 'default-32-byte-key-for-dev-only!';
    })(),
  },

  // CORS
  cors: {
    origins: (process.env.CORS_ORIGINS || 'app://stellarity,http://localhost:5173').split(',').map(s => s.trim()),
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

/** Validate critical config values at startup. Throws on invalid config. */
export function validateConfig(): void {
  const errors: string[] = [];

  if (config.port < 1 || config.port > 65535 || isNaN(config.port)) {
    errors.push(`Invalid PORT: ${config.port}`);
  }

  if (!config.database.url && !config.database.host) {
    errors.push('DATABASE_URL or DB_HOST must be set');
  }

  if (config.database.port < 1 || config.database.port > 65535 || isNaN(config.database.port)) {
    errors.push(`Invalid DB_PORT: ${config.database.port}`);
  }

  if (!config.isDev) {
    if (config.encryption.key === 'default-32-byte-key-for-dev-only!') {
      errors.push('ENCRYPTION_KEY must be changed from default in production');
    }
    if (config.cors.origins.includes('http://localhost:5173')) {
      errors.push('CORS_ORIGINS should not include localhost in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}
