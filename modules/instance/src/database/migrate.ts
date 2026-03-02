/**
 * Instance Database Schema Migration — SQLite (Versioned)
 *
 * The instance server stores community data (servers, channels, messages, voice)
 * and instance-local moderation actions. User accounts are managed by the central
 * server — the instance only tracks membership via user IDs from centrally-signed JWTs.
 *
 * All UUIDs are generated in application code (uuid v4) and stored as TEXT.
 * Timestamps are stored as TEXT (ISO-8601) with defaults via strftime().
 */
import { getDb } from './database.js';
import { logger } from '../utils/logger.js';

interface Migration {
  version: number;
  name: string;
  up: (db: ReturnType<typeof getDb>) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up(db) {
      // ── Instance Members ─────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS instance_members (
          user_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          display_name TEXT,
          avatar_url TEXT,
          joined_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          last_seen_at TEXT,
          is_banned INTEGER DEFAULT 0,
          ban_reason TEXT,
          notes TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_instance_members_username ON instance_members(username);
      `);

      // ── Servers ──────────────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS servers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          icon_url TEXT,
          owner_id TEXT NOT NULL,
          invite_code TEXT UNIQUE,
          max_members INTEGER DEFAULT 500,
          is_public INTEGER DEFAULT 1,
          password_hash TEXT,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_id);
        CREATE INDEX IF NOT EXISTS idx_servers_invite ON servers(invite_code);
      `);

      // ── Server Members ───────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS server_members (
          id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          nickname TEXT,
          joined_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE(server_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_server_members_server ON server_members(server_id);
        CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);
      `);

      // ── Roles ────────────────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS roles (
          id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          color TEXT,
          position INTEGER DEFAULT 0,
          permissions TEXT NOT NULL DEFAULT '{}',
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_roles_server ON roles(server_id);
      `);

      // ── Member Roles ─────────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS member_roles (
          member_id TEXT NOT NULL REFERENCES server_members(id) ON DELETE CASCADE,
          role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
          PRIMARY KEY (member_id, role_id)
        );
      `);

      // ── Categories ───────────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          position INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_categories_server ON categories(server_id);
      `);

      // ── Channels ─────────────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS channels (
          id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'text',
          description TEXT,
          position INTEGER DEFAULT 0,
          bitrate INTEGER DEFAULT 64000,
          user_limit INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id);
      `);

      // ── Messages ─────────────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          encrypted INTEGER DEFAULT 0,
          attachments TEXT DEFAULT '[]',
          embeds TEXT DEFAULT '[]',
          reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
          pinned INTEGER DEFAULT 0,
          edited_at TEXT,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
        CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(channel_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(channel_id, pinned);
      `);

      // ── Voice States ─────────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS voice_states (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE,
          channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
          server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
          self_mute INTEGER DEFAULT 0,
          self_deaf INTEGER DEFAULT 0,
          joined_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_voice_states_channel ON voice_states(channel_id);
        -- idx_voice_states_user omitted: user_id UNIQUE already provides an index
      `);

      // ── Moderation Actions ───────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS moderation_actions (
          id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          moderator_id TEXT NOT NULL,
          action TEXT NOT NULL,
          reason TEXT,
          duration INTEGER,
          expires_at TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_mod_actions_server ON moderation_actions(server_id);
        CREATE INDEX IF NOT EXISTS idx_mod_actions_user ON moderation_actions(user_id);
        CREATE INDEX IF NOT EXISTS idx_mod_actions_active ON moderation_actions(server_id, user_id, action, is_active);
      `);

      // ── Audit Logs ───────────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          action TEXT NOT NULL,
          target_type TEXT,
          target_id TEXT,
          details TEXT,
          ip_address TEXT,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
      `);

      // ── Instance Settings ────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS instance_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
      `);

      // ── Server Creators ──────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS server_creators (
          user_id TEXT PRIMARY KEY,
          added_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
      `);

      // ── Triggers ─────────────────────────────────────────────────────
      const tablesWithUpdatedAt = ['servers', 'channels'];
      for (const table of tablesWithUpdatedAt) {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS update_${table}_updated_at
            AFTER UPDATE ON ${table}
            FOR EACH ROW
            BEGIN
              UPDATE ${table} SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              WHERE rowid = NEW.rowid;
            END;
        `);
      }

      // ── ALTER TABLE additions for early schema ───────────────────────
      const alterMigrations = [
        { table: 'servers', column: 'is_public', sql: `ALTER TABLE servers ADD COLUMN is_public INTEGER DEFAULT 1` },
        { table: 'servers', column: 'password_hash', sql: `ALTER TABLE servers ADD COLUMN password_hash TEXT` },
        { table: 'channels', column: 'category_id', sql: `ALTER TABLE channels ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL` },
        { table: 'channels', column: 'is_temporary', sql: `ALTER TABLE channels ADD COLUMN is_temporary INTEGER DEFAULT 0` },
        { table: 'channels', column: 'created_by', sql: `ALTER TABLE channels ADD COLUMN created_by TEXT` },
        { table: 'channels', column: 'password_hash', sql: `ALTER TABLE channels ADD COLUMN password_hash TEXT` },
        { table: 'channels', column: 'expires_when_empty', sql: `ALTER TABLE channels ADD COLUMN expires_when_empty INTEGER DEFAULT 0` },
      ];

      for (const m of alterMigrations) {
        try {
          const cols = db.prepare(`PRAGMA table_info(${m.table})`).all() as any[];
          if (!cols.some((c: any) => c.name === m.column)) {
            db.exec(m.sql);
          }
        } catch { /* column may already exist */ }
      }

      try { db.exec(`CREATE INDEX IF NOT EXISTS idx_servers_public ON servers(is_public)`); } catch { /* ignore */ }
      try { db.exec(`CREATE INDEX IF NOT EXISTS idx_channels_category ON channels(category_id)`); } catch { /* ignore */ }
      try { db.exec(`CREATE INDEX IF NOT EXISTS idx_channels_temporary ON channels(is_temporary)`); } catch { /* ignore */ }

      // ── Server Features ──────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS server_features (
          server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
          build_a_lobby_enabled INTEGER DEFAULT 1,
          build_a_lobby_position INTEGER DEFAULT 0,
          auto_overflow_enabled INTEGER DEFAULT 0,
          updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
      `);

      // ── Message Reactions ────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS message_reactions (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          channel_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          emoji TEXT NOT NULL,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE(message_id, user_id, emoji)
        );
        CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);
        CREATE INDEX IF NOT EXISTS idx_reactions_user ON message_reactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_reactions_channel ON message_reactions(channel_id);
      `);

      // ── Threads ──────────────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS threads (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          parent_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          creator_id TEXT NOT NULL,
          is_archived INTEGER DEFAULT 0,
          is_locked INTEGER DEFAULT 0,
          message_count INTEGER DEFAULT 0,
          last_message_at TEXT,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          archived_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_threads_channel ON threads(channel_id);
        CREATE INDEX IF NOT EXISTS idx_threads_server ON threads(server_id);
        CREATE INDEX IF NOT EXISTS idx_threads_parent ON threads(parent_message_id);
      `);

      // ── Thread Messages ──────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS thread_messages (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          encrypted INTEGER DEFAULT 0,
          attachments TEXT DEFAULT '[]',
          embeds TEXT DEFAULT '[]',
          reply_to_id TEXT,
          edited_at TEXT,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_thread_messages_thread ON thread_messages(thread_id);
        CREATE INDEX IF NOT EXISTS idx_thread_messages_created ON thread_messages(thread_id, created_at);
      `);

      // ── Scheduled Messages ───────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_messages (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          encrypted INTEGER DEFAULT 0,
          reply_to_id TEXT,
          scheduled_for TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due ON scheduled_messages(scheduled_for, status);
        CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user ON scheduled_messages(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_scheduled_messages_channel ON scheduled_messages(channel_id);
      `);

      // ── Channel Encryption Keys ──────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS channel_member_keys (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          public_key TEXT NOT NULL,
          registered_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE(channel_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_channel_keys_channel ON channel_member_keys(channel_id);
      `);

      // ── New feature columns ──────────────────────────────────────────
      const featureMigrations = [
        { table: 'messages', column: 'expires_at', sql: `ALTER TABLE messages ADD COLUMN expires_at TEXT` },
        { table: 'messages', column: 'is_ephemeral', sql: `ALTER TABLE messages ADD COLUMN is_ephemeral INTEGER DEFAULT 0` },
        { table: 'messages', column: 'thread_id', sql: `ALTER TABLE messages ADD COLUMN thread_id TEXT` },
        { table: 'channels', column: 'is_encrypted', sql: `ALTER TABLE channels ADD COLUMN is_encrypted INTEGER DEFAULT 0` },
        { table: 'channels', column: 'ephemeral_default', sql: `ALTER TABLE channels ADD COLUMN ephemeral_default INTEGER` },
      ];

      for (const m of featureMigrations) {
        try {
          const cols = db.prepare(`PRAGMA table_info(${m.table})`).all() as any[];
          if (!cols.some((c: any) => c.name === m.column)) {
            db.exec(m.sql);
          }
        } catch { /* ignore */ }
      }

      try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_expires ON messages(expires_at) WHERE expires_at IS NOT NULL`); } catch { /* ignore */ }
      try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id) WHERE thread_id IS NOT NULL`); } catch { /* ignore */ }
      try { db.exec(`CREATE INDEX IF NOT EXISTS idx_channels_encrypted ON channels(is_encrypted) WHERE is_encrypted = 1`); } catch { /* ignore */ }
    },
  },
  {
    version: 2,
    name: 'drop_redundant_indexes',
    up(db) {
      // UNIQUE constraints already provide implicit indexes in SQLite.
      db.exec(`DROP INDEX IF EXISTS idx_voice_states_user`);
    },
  },
  // Future migrations go here as { version: 3, name: '...', up(db) { ... } }
];

export function migrate(): void {
  logger.info('Running instance database migrations...');

  const db = getDb();

  // Ensure migration tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  // Get already-applied versions
  const applied = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[];
  const appliedVersions = new Set(applied.map((r) => r.version));

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    logger.info(`Applying migration v${migration.version}: ${migration.name}`);

    const runMigration = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
    });

    try {
      runMigration();
      logger.info(`Migration v${migration.version} applied successfully`);
    } catch (error) {
      logger.error(`Migration v${migration.version} failed`, error);
      throw error;
    }
  }

  logger.info('Instance database migrations completed successfully');
}
