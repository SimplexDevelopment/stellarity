/**
 * Instance Management Panel — Express Server
 *
 * A separate HTTP server running on PANEL_PORT (default 3003) that serves
 * an embedded React SPA for instance owner management. Binds to 127.0.0.1
 * by default so it's only accessible locally (VPS access via SSH tunnel).
 *
 * Routes:
 *   /panel/api/auth/*       — login / verify session
 *   /panel/api/settings     — instance settings CRUD
 *   /panel/api/servers      — server oversight
 *   /panel/api/members      — member management
 *   /panel/api/moderation   — moderation oversight
 *   /panel/api/metrics      — metrics & monitoring
 *   /panel/api/audit-logs   — audit log viewer
 *   /*                      — static SPA files (panel UI)
 */
import express from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { initializePanelAuth } from './auth.js';
import { panelAuth } from './middleware.js';

import authRoutes from './routes/auth.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import serversRoutes from './routes/servers.routes.js';
import membersRoutes from './routes/members.routes.js';
import moderationRoutes from './routes/moderation.routes.js';
import metricsRoutes from './routes/metrics.routes.js';
import auditRoutes from './routes/audit.routes.js';

let panelServer: http.Server | null = null;

export async function startPanelServer(): Promise<http.Server | null> {
  // Initialize panel credentials (load or generate passphrase)
  await initializePanelAuth();

  const app = express();

  // Security
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));

  // CORS — same-origin only (panel UI is served from the same server)
  app.use(cors({
    origin: (origin, callback) => {
      // Allow same-origin requests (no origin header) and localhost
      if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true,
  }));

  app.use(express.json());
  app.use(cookieParser());

  // Request logging for panel
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.debug(`[Panel] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  });

  // ── API Routes ──────────────────────────────────────────────────

  // Auth routes (no auth middleware — login/verify are public)
  app.use('/panel/api/auth', authRoutes);

  // Protected routes — require valid panel session
  app.use('/panel/api/settings', panelAuth, settingsRoutes);
  app.use('/panel/api/servers', panelAuth, serversRoutes);
  app.use('/panel/api/members', panelAuth, membersRoutes);
  app.use('/panel/api/moderation', panelAuth, moderationRoutes);
  app.use('/panel/api/metrics', panelAuth, metricsRoutes);
  app.use('/panel/api/audit-logs', panelAuth, auditRoutes);

  // Panel health check (no auth)
  app.get('/panel/api/health', (req, res) => {
    res.json({ status: 'ok', panel: true });
  });

  // ── Static SPA ──────────────────────────────────────────────────

  // Serve built panel UI files
  const panelUIPath = path.resolve(__dirname, '../../dist/panel-ui');

  if (fs.existsSync(panelUIPath)) {
    app.use(express.static(panelUIPath));

    // SPA fallback — serve index.html for all non-API routes
    app.get('*', (req, res) => {
      if (req.path.startsWith('/panel/api')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.sendFile(path.join(panelUIPath, 'index.html'));
    });
  } else {
    // Panel UI not built — show a helpful message
    app.get('*', (req, res) => {
      if (req.path.startsWith('/panel/api')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(503).send(`
        <html>
          <head><title>Stellarity — Instance Panel</title></head>
          <body style="background:#0a0a0c;color:#d4a843;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
              <h1>PANEL UI NOT BUILT</h1>
              <p>Run <code>npm run build:panel</code> in the instance module to build the management panel.</p>
              <p>The API is available at <code>/panel/api/*</code></p>
            </div>
          </body>
        </html>
      `);
    });
  }

  // ── Start Server ────────────────────────────────────────────────

  const server = http.createServer(app);
  const { port, bindAddress } = config.panel;

  return new Promise((resolve) => {
    server.listen(port, bindAddress, () => {
      logger.info(`📋 Instance Management Panel running on ${bindAddress}:${port}`);

      if (bindAddress === '127.0.0.1') {
        logger.info(`   Panel is localhost-only. Access via browser: http://localhost:${port}`);
        logger.info(`   For VPS access, use SSH tunnel: ssh -L ${port}:localhost:${port} user@your-server`);
      } else {
        logger.info(`   Panel is accessible on ${bindAddress}:${port}`);
        logger.warn('   ⚠ Panel is NOT restricted to localhost — ensure it is behind a firewall or reverse proxy');
      }

      panelServer = server;
      resolve(server);
    });
  });
}

export async function stopPanelServer(): Promise<void> {
  if (panelServer) {
    return new Promise((resolve) => {
      panelServer!.close(() => {
        logger.info('Panel server closed');
        panelServer = null;
        resolve();
      });
    });
  }
}
