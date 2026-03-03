import express from 'express';
import http from 'http';
import net from 'net';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { config, validateConfig } from './config/index.js';
import { getInstanceIdentity, getInstancePublicInfo } from './config/identity.js';
import { logger } from './utils/logger.js';
import { initializeDatabase, checkConnection, closeDatabase } from './database/database.js';
import { initializeRedis, checkRedisConnection, closeRedis, isUsingFallback } from './database/redis.js';
import { migrate } from './database/migrate.js';
import { initializeSocket } from './socket/index.js';
import { errorHandler, notFoundHandler } from './middleware/validation.middleware.js';

import instanceRoutes from './routes/auth.routes.js';
import serverRoutes from './routes/server.routes.js';
import messageRoutes from './routes/message.routes.js';
import moderationRoutes from './routes/moderation.routes.js';
import lobbyRoutes from './routes/lobby.routes.js';
import reactionRoutes from './routes/reaction.routes.js';
import threadRoutes from './routes/thread.routes.js';
import scheduledRoutes from './routes/scheduled.routes.js';
import encryptionRoutes from './routes/encryption.routes.js';
import { startPanelServer, stopPanelServer } from './panel/index.js';
import { ephemeralService } from './services/ephemeral.service.js';
import { scheduledService } from './services/scheduled.service.js';

/** Maximum number of ports to try before giving up */
const MAX_PORT_ATTEMPTS = 20;

/** Check if a port is available */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port);
  });
}

/**
 * Find an available port starting from startPort.
 * Increments until a free port is found (up to MAX_PORT_ATTEMPTS).
 */
async function findAvailablePort(startPort: number): Promise<number> {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
    logger.debug(`Port ${port} in use, trying ${port + 1}...`);
  }
  throw new Error(`No available port found in range ${startPort}–${startPort + MAX_PORT_ATTEMPTS - 1}`);
}

async function startInstanceServer() {
  // Validate configuration early
  validateConfig();

  // Initialize instance identity (generates keypair on first run)
  const identity = await getInstanceIdentity();
  logger.info(`Instance ID: ${identity.instanceId}`);

  // Create Express app
  const app = express();
  const httpServer = http.createServer(app);

  // Trust reverse proxy (Nginx) — required for correct IP resolution and rate limiting
  app.set('trust proxy', 1);
  
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false,
  }));
  
  // CORS — allow multiple origins for multi-client support
  app.use(cors({
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  
  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);
  
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(compression());
  
  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.http(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  });
  
  // Health check endpoint
  app.get('/health', async (req, res) => {
    const dbHealthy = checkConnection();
    const cacheHealthy = await checkRedisConnection(); // true for both Redis and in-memory
    
    const status = dbHealthy && cacheHealthy ? 200 : 503;
    res.status(status).json({
      status: status === 200 ? 'healthy' : 'unhealthy',
      instanceId: identity.instanceId,
      instanceName: config.instance.name,
      database: dbHealthy ? 'connected' : 'disconnected',
      cache: isUsingFallback() ? 'in-memory' : (cacheHealthy ? 'redis' : 'disconnected'),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });
  
  // API routes
  app.use('/api/instance', instanceRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/servers', moderationRoutes);
  app.use('/api/servers', lobbyRoutes);
  app.use('/api', messageRoutes);
  app.use('/api', reactionRoutes);
  app.use('/api', threadRoutes);
  app.use('/api', scheduledRoutes);
  app.use('/api', encryptionRoutes);
  
  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);
  
  // Initialize Socket.IO
  initializeSocket(httpServer);
  
  // Check database connections
  logger.info('Checking database connections...');
  
  // Initialize SQLite database
  try {
    initializeDatabase();
    logger.info('SQLite database initialized');
    
    // Run migrations (synchronous)
    migrate();
    logger.info('Database migrations complete');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    process.exit(1);
  }
  
  const dbConnected = checkConnection();
  if (!dbConnected) {
    logger.warn('SQLite not connected - some features may be unavailable');
  } else {
    logger.info('SQLite connected');
  }
  
  // Initialize caching layer (Redis or in-memory fallback)
  await initializeRedis();
  
  const redisConnected = await checkRedisConnection();
  if (isUsingFallback()) {
    logger.info('Using in-memory cache (Redis not configured)');
  } else if (!redisConnected) {
    logger.warn('Redis not connected - using in-memory fallback');
  } else {
    logger.info('Redis connected');
  }

  // Register with central discovery if public
  if (config.instance.isPublic) {
    registerWithCentral(identity.instanceId).catch(err => {
      logger.warn('Failed to register with central discovery:', err.message);
    });
  }
  
  // Start server with auto port resolution
  const resolvedPort = await findAvailablePort(config.port);
  await new Promise<void>((resolve) => {
    httpServer.listen(resolvedPort, () => resolve());
  });
  logger.info(`🚀 Stellarity Instance Server running on port ${resolvedPort}`);
  logger.info(`   Instance: ${config.instance.name} (${identity.instanceId})`);
  logger.info(`   Environment: ${config.nodeEnv}`);
  logger.info(`   Public: ${config.instance.isPublic}`);
  logger.info(`   Central Server: ${config.central.url}`);
  if (resolvedPort !== config.port) {
    logger.info(`   Port ${config.port} was in use — auto-resolved to ${resolvedPort}`);
  }

  // Start management panel server
  await startPanelServer();

  // Start background service loops
  ephemeralService.startCleanupLoop();
  scheduledService.startDeliveryLoop();
  
  // Graceful shutdown
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`${signal} received, shutting down gracefully...`);
    
    // Force shutdown after 30 seconds
    const forceTimeout = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
    forceTimeout.unref();

    // Stop accepting new connections
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });

    // Clean up resources sequentially
    ephemeralService.stopCleanupLoop();
    scheduledService.stopDeliveryLoop();
    await stopPanelServer();
    closeDatabase();
    await closeRedis();
    
    logger.info('Shutdown complete');
    clearTimeout(forceTimeout);
    process.exit(0);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/** Register this instance with the central discovery service */
async function registerWithCentral(instanceId: string): Promise<void> {
  const info = await getInstancePublicInfo();
  const centralUrl = config.central.url;

  try {
    const response = await fetch(`${centralUrl}/api/discovery/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instanceId,
        instanceName: info.name,
        description: info.description,
        url: `http://localhost:${config.port}`, // TODO: use actual public URL
        publicKey: info.publicKey,
        memberCount: info.memberCount,
        maxMembers: info.maxMembers,
        tags: info.tags,
        region: info.region,
        iconUrl: info.iconUrl,
        status: 'online',
      }),
    });

    if (response.ok) {
      logger.info('Registered with central discovery service');
    } else {
      logger.warn(`Central discovery registration failed: ${response.status}`);
    }
  } catch (error) {
    logger.warn('Could not reach central server for discovery registration');
  }

  // Set up periodic heartbeat
  setInterval(async () => {
    try {
      const currentInfo = await getInstancePublicInfo();
      await fetch(`${centralUrl}/api/discovery/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId,
          memberCount: currentInfo.memberCount,
          status: 'online',
        }),
      });
    } catch {
      // Silently fail heartbeats
    }
  }, config.central.heartbeatInterval);
}

startInstanceServer().catch((error) => {
  logger.error('Failed to start instance server:', error);
  process.exit(1);
});
