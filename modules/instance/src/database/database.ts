/**
 * Instance Database — SQLite via Bun's built-in bun:sqlite
 *
 * Lightweight, embedded database that starts with the instance.
 * No external container required — the file lives in the instance's data directory.
 *
 * Provides a pg-compatible query() interface so services can use the same pattern.
 */
import { Database } from 'bun:sqlite';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// ── Types ────────────────────────────────────────────────────────────

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

// ── Database Instance ────────────────────────────────────────────────

let db: Database | null = null;

/**
 * Initialize the SQLite database.
 * Creates the data directory and database file if they don't exist.
 */
export function initializeDatabase(): Database {
  if (db) return db;

  const dbPath = path.join(config.instance.dataDir, 'instance.db');
  logger.info(`Opening SQLite database at: ${dbPath}`);

  db = new Database(dbPath, { create: true });

  // Enable WAL mode for better concurrent read performance
  db.exec('PRAGMA journal_mode = WAL');
  // Enforce foreign keys
  db.exec('PRAGMA foreign_keys = ON');
  // Reasonable busy timeout
  db.exec('PRAGMA busy_timeout = 5000');

  logger.info('SQLite database initialized (bun:sqlite)');
  return db;
}

/** Get the database instance (must call initializeDatabase() first) */
export function getDb(): Database {
  if (!db) {
    return initializeDatabase();
  }
  return db;
}

// ── Query Helpers ────────────────────────────────────────────────────

/**
 * Execute a SQL query.
 *
 * Accepts PostgreSQL-style `$1, $2, ...` placeholders and converts them
 * to SQLite `?` placeholders transparently, so existing service code
 * doesn't need mass refactoring.
 *
 * Returns a pg-compatible { rows, rowCount } object.
 */
export function query(text: string, params?: any[]): QueryResult {
  const database = getDb();
  const start = Date.now();

  // Convert $1, $2, ... placeholders to ?
  const sqliteText = convertPlaceholders(text);

  try {
    const trimmed = sqliteText.trim().toUpperCase();
    const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('(SELECT') || trimmed.startsWith('WITH');
    const hasReturning = /\bRETURNING\b/i.test(sqliteText);

    if (isSelect || hasReturning) {
      const stmt = database.query(sqliteText);
      const rows = stmt.all(...(params || [])) as any[];
      const duration = Date.now() - start;
      logger.debug('Executed query', { text: text.substring(0, 100), duration, rows: rows.length });
      return { rows, rowCount: rows.length };
    } else {
      const stmt = database.query(sqliteText);
      stmt.run(...(params || []));
      const changes = database.query('SELECT changes() as changes').get() as any;
      const duration = Date.now() - start;
      logger.debug('Executed query', { text: text.substring(0, 100), duration, changes: changes?.changes ?? 0 });
      return { rows: [], rowCount: changes?.changes ?? 0 };
    }
  } catch (error) {
    logger.error('Database query error:', { text: text.substring(0, 100), error });
    throw error;
  }
}

/**
 * Run multiple statements in a transaction.
 * The callback receives a `run` function for executing individual queries.
 */
export function transaction<T>(callback: () => T): T {
  const database = getDb();
  const txn = database.transaction(callback);
  return txn();
}

/**
 * Execute raw SQL (for migrations — supports multi-statement strings).
 */
export function exec(sql: string): void {
  const database = getDb();
  database.exec(sql);
}

// ── Utilities ────────────────────────────────────────────────────────

/** Convert PostgreSQL $1, $2 ... placeholders to SQLite ? placeholders */
function convertPlaceholders(sql: string): string {
  // Replace $N with ? while preserving order (params array already ordered)
  return sql.replace(/\$\d+/g, '?');
}

/** Generate a new UUID v4 */
export function generateId(): string {
  return crypto.randomUUID();
}

/** Get current ISO timestamp (SQLite stores timestamps as TEXT) */
export function now(): string {
  return new Date().toISOString();
}

// ── Health & Lifecycle ───────────────────────────────────────────────

/** Check if the database is accessible */
export function checkConnection(): boolean {
  try {
    const database = getDb();
    const result = database.query('SELECT 1 as ok').get() as any;
    return result?.ok === 1;
  } catch {
    return false;
  }
}

/** Close the database (for graceful shutdown) */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('SQLite database closed');
  }
}
