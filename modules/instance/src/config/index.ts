import path from 'path';

// Bun automatically loads .env from the working directory.
// No dotenv import needed.

export const config = {
  // Server
  port: parseInt(process.env.PORT || '4150', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // Instance Identity
  instance: {
    id: process.env.INSTANCE_ID || '', // Generated on first setup
    name: process.env.INSTANCE_NAME || 'Stellarity Instance',
    description: process.env.INSTANCE_DESCRIPTION || null,
    isPublic: process.env.INSTANCE_PUBLIC === 'true',
    region: process.env.INSTANCE_REGION || null,
    tags: (process.env.INSTANCE_TAGS || '').split(',').filter(Boolean),
    maxMembers: parseInt(process.env.INSTANCE_MAX_MEMBERS || '500', 10),
    iconUrl: process.env.INSTANCE_ICON_URL || null,
    dataDir: process.env.INSTANCE_DATA_DIR || path.resolve(__dirname, '../../data'),
  },

  // Central Server Connection
  central: {
    url: process.env.CENTRAL_SERVER_URL || 'https://api.stellarity.app',
    publicKeyUrl: process.env.CENTRAL_PUBLIC_KEY_URL || '', // Auto-derived from url if empty
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '60000', 10),
  },

  // Database (SQLite — stored in dataDir)
  database: {
    filename: process.env.DB_FILENAME || 'instance.db',
  },

  // Redis (optional — in-memory fallback used when disabled)
  redis: {
    disabled: process.env.REDIS_DISABLED === 'true' || (!process.env.REDIS_HOST && !process.env.REDIS_URL),
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || '',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // Encryption (instance-local for message encryption)
  encryption: {
    key: (() => {
      const key = process.env.ENCRYPTION_KEY;
      if (!key && process.env.NODE_ENV === 'production') {
        throw new Error('ENCRYPTION_KEY must be set in production');
      }
      return key || 'default-32-byte-key-for-dev-only!';
    })(),
    voiceKey: (() => {
      const key = process.env.VOICE_ENCRYPTION_KEY;
      if (!key && process.env.NODE_ENV === 'production') {
        throw new Error('VOICE_ENCRYPTION_KEY must be set in production');
      }
      return key || 'voice-32-byte-key-for-dev-only!!';
    })(),
  },

  // CORS
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()),
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // Voice
  voice: {
    maxUsersPerChannel: parseInt(process.env.VOICE_MAX_USERS_PER_CHANNEL || '50', 10),
    bitrate: parseInt(process.env.VOICE_BITRATE || '64000', 10),
  },

  // Management Panel
  panel: {
    port: parseInt(process.env.PANEL_PORT || '3003', 10),
    bindAddress: process.env.PANEL_BIND_ADDRESS || '127.0.0.1', // localhost-only by default for security
    password: process.env.PANEL_PASSWORD || '', // if empty, auto-generated on first boot
    sessionDuration: parseInt(process.env.PANEL_SESSION_DURATION || '7200', 10), // 2 hours in seconds
  },
};

/** Validate critical config values at startup. Throws on invalid config. */
export function validateConfig(): void {
  const errors: string[] = [];

  if (config.port < 1 || config.port > 65535 || isNaN(config.port)) {
    errors.push(`Invalid PORT: ${config.port}`);
  }

  if (!config.isDev) {
    if (config.encryption.key === 'default-32-byte-key-for-dev-only!') {
      errors.push('ENCRYPTION_KEY must be changed from default in production');
    }
    if (config.encryption.voiceKey === 'voice-32-byte-key-for-dev-only!!') {
      errors.push('VOICE_ENCRYPTION_KEY must be changed from default in production');
    }
    if (!config.central.url || config.central.url === 'https://api.stellarity.app') {
      errors.push('CENTRAL_SERVER_URL should be explicitly set in production');
    }
  }

  if (config.voice.maxUsersPerChannel < 1 || config.voice.maxUsersPerChannel > 1000) {
    errors.push(`Invalid VOICE_MAX_USERS_PER_CHANNEL: ${config.voice.maxUsersPerChannel}`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}
