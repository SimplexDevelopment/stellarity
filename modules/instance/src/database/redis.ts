import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// In-memory fallback store when Redis is unavailable
class MemoryStore {
  private store = new Map<string, { value: string; expiry?: number }>();
  private sets = new Map<string, Set<string>>();
  private hashes = new Map<string, Map<string, string>>();
  private sweepTimer: ReturnType<typeof setInterval>;

  constructor(sweepIntervalMs = 60_000) {
    // Periodically sweep expired entries so un-read keys don't leak
    this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
    this.sweepTimer.unref(); // don't block process exit
  }

  /** Remove all expired entries from the key-value store. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, item] of this.store) {
      if (item.expiry && now > item.expiry) {
        this.store.delete(key);
      }
    }
  }

  /** Stop the periodic sweep and clear all data. */
  destroy(): void {
    clearInterval(this.sweepTimer);
    this.store.clear();
    this.sets.clear();
    this.hashes.clear();
  }

  private isExpired(key: string): boolean {
    const item = this.store.get(key);
    if (!item?.expiry) return false;
    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  get(key: string): string | null {
    if (this.isExpired(key)) return null;
    return this.store.get(key)?.value ?? null;
  }

  set(key: string, value: string, ttlSeconds?: number): void {
    this.store.set(key, {
      value,
      expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  del(...keys: string[]): number {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
      this.sets.delete(key);
      this.hashes.delete(key);
    }
    return count;
  }

  exists(key: string): number {
    if (this.isExpired(key)) return 0;
    return this.store.has(key) ? 1 : 0;
  }

  expire(key: string, ttlSeconds: number): number {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expiry = Date.now() + ttlSeconds * 1000;
    return 1;
  }

  ttl(key: string): number {
    const item = this.store.get(key);
    if (!item?.expiry) return -1;
    return Math.max(0, Math.floor((item.expiry - Date.now()) / 1000));
  }

  incr(key: string): number {
    const val = parseInt(this.get(key) || '0', 10) + 1;
    this.set(key, val.toString());
    return val;
  }

  decr(key: string): number {
    const val = parseInt(this.get(key) || '0', 10) - 1;
    this.set(key, val.toString());
    return val;
  }

  // Hash operations
  hset(key: string, field: string, value: string): number {
    if (!this.hashes.has(key)) this.hashes.set(key, new Map());
    const isNew = !this.hashes.get(key)!.has(field);
    this.hashes.get(key)!.set(field, value);
    return isNew ? 1 : 0;
  }

  hget(key: string, field: string): string | null {
    return this.hashes.get(key)?.get(field) ?? null;
  }

  hgetall(key: string): Record<string, string> {
    const hash = this.hashes.get(key);
    if (!hash) return {};
    return Object.fromEntries(hash.entries());
  }

  hdel(key: string, ...fields: string[]): number {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    let count = 0;
    for (const field of fields) {
      if (hash.delete(field)) count++;
    }
    return count;
  }

  // Set operations
  sadd(key: string, ...members: string[]): number {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    const set = this.sets.get(key)!;
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }
    return added;
  }

  srem(key: string, ...members: string[]): number {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) removed++;
    }
    return removed;
  }

  smembers(key: string): string[] {
    return Array.from(this.sets.get(key) ?? []);
  }

  sismember(key: string, member: string): number {
    return this.sets.get(key)?.has(member) ? 1 : 0;
  }

  scard(key: string): number {
    return this.sets.get(key)?.size ?? 0;
  }

  // Pub/Sub (no-op in memory mode - events handled locally)
  publish(_channel: string, _message: string): number {
    return 0;
  }

  ping(): string {
    return 'PONG';
  }
}

// State management
let redis: Redis | null = null;
let memoryStore: MemoryStore | null = null;
let useMemoryFallback = false;

// Initialize Redis with fallback
export async function initializeRedis(): Promise<void> {
  // Skip Redis entirely if disabled or host not configured
  if (config.redis.disabled || !config.redis.host) {
    logger.info('Redis disabled — using in-memory store (suitable for development)');
    useMemoryFallback = true;
    memoryStore = new MemoryStore();
    return;
  }

  try {
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn('Redis unavailable after 3 retries, switching to in-memory fallback');
          useMemoryFallback = true;
          memoryStore = new MemoryStore();
          return null; // Stop retrying
        }
        const delay = Math.min(times * 100, 2000);
        return delay;
      },
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 5000,
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
      useMemoryFallback = false;
    });

    redis.on('ready', () => {
      logger.info('Redis ready');
    });

    redis.on('error', (err) => {
      if (!useMemoryFallback) {
        logger.error('Redis error:', err.message);
      }
    });

    redis.on('close', () => {
      if (!useMemoryFallback) {
        logger.warn('Redis connection closed');
      }
    });

    await redis.connect();
    await redis.ping();
    logger.info('Redis connection established');
  } catch (error) {
    logger.warn('Redis unavailable, using in-memory fallback for caching');
    useMemoryFallback = true;
    memoryStore = new MemoryStore();
  }
}

// Get the active store (Redis or Memory)
function getStore(): Redis | MemoryStore {
  if (useMemoryFallback || !redis) {
    if (!memoryStore) {
      memoryStore = new MemoryStore();
    }
    return memoryStore;
  }
  return redis;
}

// Cache helper functions
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const store = getStore();
    const value = await store.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  },

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const store = getStore();
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (store instanceof MemoryStore) {
      store.set(key, stringValue, ttlSeconds);
    } else if (ttlSeconds) {
      await store.setex(key, ttlSeconds, stringValue);
    } else {
      await store.set(key, stringValue);
    }
  },

  async del(key: string | string[]): Promise<number> {
    const store = getStore();
    const keys = Array.isArray(key) ? key : [key];
    return store.del(...keys);
  },

  async exists(key: string): Promise<boolean> {
    const store = getStore();
    return (await store.exists(key)) === 1;
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const store = getStore();
    await store.expire(key, ttlSeconds);
  },

  async ttl(key: string): Promise<number> {
    const store = getStore();
    return store.ttl(key);
  },

  async incr(key: string): Promise<number> {
    const store = getStore();
    return store.incr(key);
  },

  async decr(key: string): Promise<number> {
    const store = getStore();
    return store.decr(key);
  },

  async hset(key: string, field: string, value: any): Promise<void> {
    const store = getStore();
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    await store.hset(key, field, stringValue);
  },

  async hget<T>(key: string, field: string): Promise<T | null> {
    const store = getStore();
    const value = await store.hget(key, field);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  },

  async hgetall<T>(key: string): Promise<Record<string, T>> {
    const store = getStore();
    const values = await store.hgetall(key);
    const result: Record<string, T> = {};
    for (const [k, v] of Object.entries(values)) {
      try {
        result[k] = JSON.parse(v) as T;
      } catch {
        result[k] = v as unknown as T;
      }
    }
    return result;
  },

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const store = getStore();
    return store.hdel(key, ...fields);
  },

  async sadd(key: string, ...members: string[]): Promise<number> {
    const store = getStore();
    return store.sadd(key, ...members);
  },

  async srem(key: string, ...members: string[]): Promise<number> {
    const store = getStore();
    return store.srem(key, ...members);
  },

  async smembers(key: string): Promise<string[]> {
    const store = getStore();
    return store.smembers(key);
  },

  async sismember(key: string, member: string): Promise<boolean> {
    const store = getStore();
    return (await store.sismember(key, member)) === 1;
  },

  async scard(key: string): Promise<number> {
    const store = getStore();
    return store.scard(key);
  },

  async publish(channel: string, message: any): Promise<number> {
    const store = getStore();
    const stringMessage = typeof message === 'string' ? message : JSON.stringify(message);
    return store.publish(channel, stringMessage);
  },
};

// Session management
export const sessions = {
  async create(userId: string, sessionData: any, ttlSeconds = 86400): Promise<void> {
    const key = `session:${userId}`;
    await cache.set(key, sessionData, ttlSeconds);
  },

  async get(userId: string): Promise<any | null> {
    return cache.get(`session:${userId}`);
  },

  async destroy(userId: string): Promise<void> {
    await cache.del(`session:${userId}`);
  },

  async refresh(userId: string, ttlSeconds = 86400): Promise<void> {
    await cache.expire(`session:${userId}`, ttlSeconds);
  },
};

// Online presence tracking
export const presence = {
  async setOnline(userId: string, socketId: string): Promise<void> {
    await cache.hset('users:online', userId, { socketId, timestamp: Date.now() });
    await cache.sadd('presence:online', userId);
  },

  async setOffline(userId: string): Promise<void> {
    await cache.hdel('users:online', userId);
    await cache.srem('presence:online', userId);
  },

  async isOnline(userId: string): Promise<boolean> {
    return cache.sismember('presence:online', userId);
  },

  async getOnlineUsers(): Promise<string[]> {
    return cache.smembers('presence:online');
  },

  async getOnlineCount(): Promise<number> {
    return cache.scard('presence:online');
  },
};

// Voice channel tracking
export const voiceChannels = {
  async join(channelId: string, userId: string): Promise<void> {
    await cache.sadd(`voice:channel:${channelId}`, userId);
    await cache.set(`voice:user:${userId}`, channelId);
  },

  async leave(channelId: string, userId: string): Promise<void> {
    await cache.srem(`voice:channel:${channelId}`, userId);
    await cache.del(`voice:user:${userId}`);
    // Remove connection quality
    await cache.hdel(`voice:quality:${channelId}`, userId);
  },

  async getUsers(channelId: string): Promise<string[]> {
    return cache.smembers(`voice:channel:${channelId}`);
  },

  async getUserChannel(userId: string): Promise<string | null> {
    return cache.get(`voice:user:${userId}`);
  },

  async getUserCount(channelId: string): Promise<number> {
    return cache.scard(`voice:channel:${channelId}`);
  },
  
  // Host management
  async setHost(channelId: string, userId: string): Promise<void> {
    await cache.set(`voice:host:${channelId}`, userId);
  },
  
  async getHost(channelId: string): Promise<string | null> {
    return cache.get(`voice:host:${channelId}`);
  },
  
  async clearHost(channelId: string): Promise<void> {
    await cache.del(`voice:host:${channelId}`);
  },
  
  // Connection quality tracking (0-100, higher is better)
  async updateConnectionQuality(channelId: string, userId: string, quality: number): Promise<void> {
    await cache.hset(`voice:quality:${channelId}`, userId, quality.toString());
  },
  
  async getConnectionQualities(channelId: string): Promise<Record<string, number>> {
    const raw = await cache.hgetall(`voice:quality:${channelId}`);
    const result: Record<string, number> = {};
    for (const [userId, quality] of Object.entries(raw)) {
      result[userId] = parseInt(quality as string, 10);
    }
    return result;
  },
  
  // Find best host based on connection quality
  async findBestHost(channelId: string): Promise<string | null> {
    const users = await this.getUsers(channelId);
    if (users.length === 0) return null;
    
    const qualities = await this.getConnectionQualities(channelId);
    
    // Find user with highest quality, default to 50 if no quality reported
    let bestUser = users[0];
    let bestQuality = qualities[users[0]] ?? 50;
    
    for (const userId of users) {
      const quality = qualities[userId] ?? 50;
      if (quality > bestQuality) {
        bestQuality = quality;
        bestUser = userId;
      }
    }
    
    return bestUser;
  },
};

// Message caching for recent messages
export const messageCache = {
  // Cache recent message (1 hour TTL)
  async cacheMessage(channelId: string, messageId: string, message: any): Promise<void> {
    const key = `messages:${channelId}`;
    await cache.hset(key, messageId, message);
    await cache.expire(key, 3600); // 1 hour TTL
  },

  // Get cached messages for a channel
  async getMessages(channelId: string): Promise<Record<string, any>> {
    return cache.hgetall(`messages:${channelId}`);
  },

  // Invalidate channel message cache
  async invalidate(channelId: string): Promise<void> {
    await cache.del(`messages:${channelId}`);
  },
};

// Health check
export async function checkRedisConnection(): Promise<boolean> {
  try {
    const store = getStore();
    const result = await store.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

// Check if using fallback
export function isUsingFallback(): boolean {
  return useMemoryFallback;
}

// Close connection (for graceful shutdown)
export async function closeRedis(): Promise<void> {
  if (redis && !useMemoryFallback) {
    await redis.quit();
    logger.info('Redis connection closed');
  }
  if (memoryStore) {
    memoryStore.destroy();
    memoryStore = null;
    logger.info('In-memory store cleaned up');
  }
}

export { redis };
