import { query } from './postgres.js';
import { logger } from '../utils/logger.js';

/**
 * Central Server Database Schema
 * 
 * Manages:
 * - User accounts (credentials, profiles, MFA)
 * - Instance discovery registry
 * - DM message buffer (ephemeral)
 * - Subscription/premium tracking
 * - Audit logs
 */
export async function migrate(): Promise<void> {
  logger.info('Running central database migrations...');

  // Users table — the canonical source of identity
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(32) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(64),
      avatar_url TEXT,
      status VARCHAR(20) DEFAULT 'offline',
      status_message VARCHAR(128),
      mfa_secret VARCHAR(64),
      mfa_enabled BOOLEAN DEFAULT FALSE,
      mfa_backup_codes JSONB DEFAULT '[]'::jsonb,
      subscription_tier VARCHAR(20) DEFAULT 'free',
      subscription_expires_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_seen_at TIMESTAMP WITH TIME ZONE,
      is_verified BOOLEAN DEFAULT FALSE
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // Refresh tokens
  await query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      device_info TEXT,
      ip_address VARCHAR(45),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
  `);

  // Instance discovery registry
  await query(`
    CREATE TABLE IF NOT EXISTS instance_registry (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(64) NOT NULL,
      description TEXT,
      url TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_public BOOLEAN DEFAULT TRUE,
      is_verified BOOLEAN DEFAULT FALSE,
      tags JSONB DEFAULT '[]'::jsonb,
      category VARCHAR(32),
      region VARCHAR(64),
      member_count INTEGER DEFAULT 0,
      max_members INTEGER DEFAULT 500,
      icon_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_heartbeat_at TIMESTAMP WITH TIME ZONE
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_instance_registry_owner ON instance_registry(owner_id);
    CREATE INDEX IF NOT EXISTS idx_instance_registry_public ON instance_registry(is_public) WHERE is_public = true;
    CREATE INDEX IF NOT EXISTS idx_instance_registry_name ON instance_registry USING gin(to_tsvector('english', name));
  `);

  // DM conversations
  await query(`
    CREATE TABLE IF NOT EXISTS dm_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_message_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user1_id, user2_id),
      CHECK (user1_id < user2_id)
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_dm_conversations_user1 ON dm_conversations(user1_id);
    CREATE INDEX IF NOT EXISTS idx_dm_conversations_user2 ON dm_conversations(user2_id);
  `);

  // DM buffer — ephemeral storage for offline messages
  await query(`
    CREATE TABLE IF NOT EXISTS dm_buffer (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_encrypted TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      delivered_at TIMESTAMP WITH TIME ZONE
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_dm_buffer_recipient ON dm_buffer(recipient_id) WHERE delivered_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_dm_buffer_expires ON dm_buffer(expires_at);
    CREATE INDEX IF NOT EXISTS idx_dm_buffer_conversation ON dm_buffer(conversation_id);
  `);

  // Subscriptions tracking
  await query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier VARCHAR(20) NOT NULL DEFAULT 'premium',
      stripe_customer_id VARCHAR(255),
      stripe_subscription_id VARCHAR(255),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      current_period_start TIMESTAMP WITH TIME ZONE,
      current_period_end TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_customer_id);
  `);

  // Audit logs
  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(64) NOT NULL,
      target_type VARCHAR(32),
      target_id UUID,
      details JSONB,
      ip_address VARCHAR(45),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `);

  // Admin accounts — separate from regular users
  await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(32) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(64),
      role VARCHAR(20) NOT NULL DEFAULT 'admin',
      mfa_secret VARCHAR(64),
      mfa_enabled BOOLEAN DEFAULT FALSE,
      mfa_backup_codes JSONB DEFAULT '[]'::jsonb,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_login_at TIMESTAMP WITH TIME ZONE
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);
  `);

  // Admin refresh tokens
  await query(`
    CREATE TABLE IF NOT EXISTS admin_refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      device_info TEXT,
      ip_address VARCHAR(45),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_admin_refresh_tokens_admin ON admin_refresh_tokens(admin_id);
    CREATE INDEX IF NOT EXISTS idx_admin_refresh_tokens_hash ON admin_refresh_tokens(token_hash);
  `);

  // User suspension columns (ALTER TABLE IF NOT EXISTS pattern)
  await query(`
    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by UUID;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
    END $$;
  `);

  // Extend audit_logs with actor tracking
  await query(`
    DO $$ BEGIN
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_type VARCHAR(20) DEFAULT 'user';
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
    END $$;
  `);

  // Update timestamp trigger
  await query(`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  const tables = ['users', 'instance_registry', 'subscriptions', 'admins'];
  for (const table of tables) {
    await query(`
      DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
      CREATE TRIGGER update_${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
    `);
  }

  logger.info('Central database migrations completed successfully');
}
