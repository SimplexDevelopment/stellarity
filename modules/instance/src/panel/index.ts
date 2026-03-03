/**
 * Instance Management Panel — Express Router
 *
 * Mounted at /panel on the main instance HTTP server. Serves the embedded
 * React SPA and management API endpoints for instance owners.
 *
 * Routes (relative to /panel mount):
 *   /api/auth/*       — login / verify session
 *   /api/settings     — instance settings CRUD
 *   /api/servers      — server oversight
 *   /api/members      — member management
 *   /api/moderation   — moderation oversight
 *   /api/metrics      — metrics & monitoring
 *   /api/audit-logs   — audit log viewer
 *   /api/database     — database browser & editor
 *   /*                — static SPA files (panel UI)
 */
import express, { Router } from 'express';
import path from 'path';
import fs from 'fs';

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
import databaseRoutes from './routes/database.routes.js';

/**
 * Create and return the panel Express router.
 * Must be called after initializePanelAuth().
 *
 * The router is designed to be mounted at `/panel` on the main instance app,
 * so all internal paths are relative (e.g. `/api/auth` → `/panel/api/auth`).
 */
export async function createPanelRouter(): Promise<Router> {
  // Initialize panel credentials (load or generate passphrase)
  await initializePanelAuth();

  const router = Router();

  // Request logging for panel
  router.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.debug(`[Panel] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
  });

  // ── API Routes ──────────────────────────────────────────────────

  // Auth routes (no auth middleware — login/verify are public)
  router.use('/api/auth', authRoutes);

  // Protected routes — require valid panel session
  router.use('/api/settings', panelAuth, settingsRoutes);
  router.use('/api/servers', panelAuth, serversRoutes);
  router.use('/api/members', panelAuth, membersRoutes);
  router.use('/api/moderation', panelAuth, moderationRoutes);
  router.use('/api/metrics', panelAuth, metricsRoutes);
  router.use('/api/audit-logs', panelAuth, auditRoutes);
  router.use('/api/database', panelAuth, databaseRoutes);

  // Panel health check (no auth)
  router.get('/api/health', (req, res) => {
    res.json({ status: 'ok', panel: true });
  });

  // ── Static SPA ──────────────────────────────────────────────────

  // Serve built panel UI files
  const panelUIPath = path.resolve(__dirname, '../../dist/panel-ui');

  if (fs.existsSync(panelUIPath)) {
    router.use(express.static(panelUIPath));

    // SPA fallback — serve index.html for all non-API routes
    router.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.sendFile(path.join(panelUIPath, 'index.html'));
    });
  } else {
    // Panel UI not built — show a helpful message
    router.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(503).send(`
        <html>
          <head><title>Stellarity — Instance Panel</title></head>
          <body style="background:#0a0a0c;color:#d4a843;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
              <h1>PANEL UI NOT BUILT</h1>
              <p>Run <code>bun run build:panel</code> in the instance module to build the management panel.</p>
              <p>The API is available at <code>/panel/api/*</code></p>
            </div>
          </body>
        </html>
      `);
    });
  }

  logger.info('📋 Panel router created — mounted at /panel');
  return router;
}
