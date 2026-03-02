/**
 * Stellarity — Central Server
 * 
 * The centralized identity, discovery, and DM buffering server.
 * All user authentication flows go through here; JWTs signed with
 * Ed25519 are verified offline by instance servers.
 */
import express from 'express';
import cors from 'cors';
import http from 'http';
import { config } from './config/index.js';
import { initializeKeys, getPublicKeyPem } from './config/keys.js';
import { migrate } from './database/migrate.js';
import { checkConnection as checkDB, closePool } from './database/postgres.js';
import { initializeCentralSocket, getOnlineUserCount } from './socket/index.js';
import { errorHandler, notFoundHandler } from './middleware/auth.middleware.js';
import { discoveryService } from './services/discovery.service.js';
import { dmService } from './services/dm.service.js';
import { logger } from './utils/logger.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import discoveryRoutes from './routes/discovery.routes.js';
import dmRoutes from './routes/dm.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import adminRoutes from './routes/admin/index.js';

const app = express();
const server = http.createServer(app);

// ── Middleware ────────────────────────────────────────────────────────

app.use(cors({
  origin: config.cors.origins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging in dev
if (config.isDev) {
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });
}

// ── Routes ───────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/admin', adminRoutes);

// ── Health Check ─────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  try {
    const dbOk = await checkDB();
    res.json({
      status: 'ok',
      service: 'stellarity-central',
      uptime: process.uptime(),
      onlineUsers: getOnlineUserCount(),
      database: dbOk ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: 'degraded' });
  }
});

// ── Error Handling ───────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ── Startup ──────────────────────────────────────────────────────────

async function start(): Promise<void> {
  logger.info('Starting Stellarity Central Server...');

  // 1. Initialize Ed25519 signing keys
  await initializeKeys();
  logger.info('Ed25519 signing keys ready');

  // 2. Connect to database and run migrations
  const dbOk = await checkDB();
  if (!dbOk) {
    logger.error('Database connection failed. Retrying in 5s...');
    await new Promise(r => setTimeout(r, 5000));
    const retry = await checkDB();
    if (!retry) {
      logger.error('Database still unreachable. Exiting.');
      process.exit(1);
    }
  }
  await migrate();
  logger.info('Database migrations complete');

  // 3. Initialize Socket.IO
  initializeCentralSocket(server);
  logger.info('Socket.IO initialized');

  // 4. Start periodic cleanup tasks
  startCleanupTasks();

  // 5. Start HTTP server
  server.listen(config.port, () => {
    logger.info(`Central server listening on port ${config.port}`);
    logger.info(`Public URL: ${config.publicUrl}`);
    logger.info(`Public key endpoint: ${config.publicUrl}/api/auth/public-key`);
    logger.info(`Environment: ${config.nodeEnv}`);
  });
}

// ── Periodic Cleanup ─────────────────────────────────────────────────

function startCleanupTasks(): void {
  // Clean up expired DM buffers every hour
  setInterval(async () => {
    try {
      await dmService.cleanupExpired();
    } catch (error) {
      logger.error('DM cleanup error:', error);
    }
  }, 60 * 60 * 1000);

  // Clean up stale instances every 15 minutes
  setInterval(async () => {
    try {
      await discoveryService.cleanupStaleInstances();
    } catch (error) {
      logger.error('Instance cleanup error:', error);
    }
  }, 15 * 60 * 1000);

  logger.info('Cleanup tasks scheduled');
}

// ── Graceful Shutdown ────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  server.close(() => {
    logger.info('HTTP server closed');
  });

  await closePool();
  logger.info('Database connections closed');

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Start the server
start().catch((error) => {
  logger.error('Failed to start central server:', error);
  process.exit(1);
});

export { app, server };
