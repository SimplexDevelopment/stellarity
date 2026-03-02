/**
 * Central Authentication Service
 * 
 * Manages user accounts, passwords, MFA, and JWT issuance.
 * JWTs are signed with Ed25519 (EdDSA) using the central server's private key.
 * Instance servers verify these tokens using the public key.
 */
import { query, transaction } from '../database/postgres.js';
import { hashPassword, verifyPassword, needsRehash } from '../utils/password.js';
import { signAccessToken, signRefreshToken, hashToken, verifyRefreshToken } from '../config/keys.js';
import { logger } from '../utils/logger.js';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';

import type { CentralUser, AuthResult, RegisterInput, LoginInput } from '@stellarity/shared';

class AuthService {
  /** Register a new user */
  async register(input: RegisterInput): Promise<AuthResult> {
    const { username, email, password, displayName } = input;

    // Check username uniqueness
    const existingUsername = await query(
      'SELECT id FROM users WHERE username = $1',
      [username.toLowerCase()]
    );
    if (existingUsername.rows.length > 0) {
      throw new Error('Username already taken');
    }

    // Check email uniqueness
    const existingEmail = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existingEmail.rows.length > 0) {
      throw new Error('Email already registered');
    }

    // Hash password with Argon2id
    const passwordHash = await hashPassword(password);

    // Create user
    const result = await query(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, display_name, avatar_url, status, status_message,
                 mfa_enabled, subscription_tier, subscription_expires_at,
                 created_at, is_verified`,
      [username.toLowerCase(), email.toLowerCase(), passwordHash, displayName || username]
    );

    const user = this.mapUser(result.rows[0]);

    // Generate Ed25519, signed tokens
    const accessToken = await signAccessToken({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      subscriptionTier: user.subscriptionTier,
    });
    const refreshToken = await signRefreshToken(user.id, user.username);

    // Store refresh token hash
    await this.storeRefreshToken(user.id, refreshToken);

    logger.info(`User registered: ${user.username}`);

    return {
      user,
      accessToken,
      refreshToken,
      accessTokenExpiry: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000, // 100 years
    };
  }

  /** Login with username/email + password */
  async login(input: LoginInput, ipAddress?: string): Promise<AuthResult & { mfaRequired?: boolean; mfaToken?: string }> {
    const { login, password } = input;

    const result = await query(
      `SELECT id, username, email, password_hash, display_name, avatar_url, status,
              status_message, mfa_enabled, mfa_secret, subscription_tier,
              subscription_expires_at, created_at, is_verified, is_suspended
       FROM users
       WHERE username = $1 OR email = $1`,
      [login.toLowerCase()]
    );

    if (result.rows.length === 0) {
      await this.logAuditEvent(null, 'login_failed', 'user', null, { login }, ipAddress);
      throw new Error('Invalid credentials');
    }

    const row = result.rows[0];

    // Check if user is suspended
    if (row.is_suspended) {
      await this.logAuditEvent(row.id, 'login_failed', 'user', row.id, { reason: 'suspended' }, ipAddress);
      throw new Error('Account suspended. Contact an administrator.');
    }

    // Verify password
    const isValid = await verifyPassword(password, row.password_hash);
    if (!isValid) {
      await this.logAuditEvent(row.id, 'login_failed', 'user', row.id, { reason: 'invalid_password' }, ipAddress);
      throw new Error('Invalid credentials');
    }

    // Check if password needs rehashing
    if (needsRehash(row.password_hash)) {
      const newHash = await hashPassword(password);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, row.id]);
      logger.debug(`Password rehashed for user: ${row.username}`);
    }

    // Update last seen
    await query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [row.id]);

    const user = this.mapUser(row);

    // If MFA is enabled, return a temporary MFA token instead
    if (row.mfa_enabled) {
      const mfaToken = await signRefreshToken(user.id, user.username); // Reuse refresh token signing for MFA temp tokens
      return {
        user,
        accessToken: '',
        refreshToken: '',
        accessTokenExpiry: 0,
        mfaRequired: true,
        mfaToken,
      };
    }

    // Generate tokens
    const accessToken = await signAccessToken({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      subscriptionTier: user.subscriptionTier,
    });
    const refreshToken = await signRefreshToken(user.id, user.username);

    await this.storeRefreshToken(user.id, refreshToken, undefined, ipAddress);
    await this.logAuditEvent(user.id, 'login_success', 'user', user.id, null, ipAddress);

    logger.info(`User logged in: ${user.username}`);

    return {
      user,
      accessToken,
      refreshToken,
      accessTokenExpiry: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000,
    };
  }

  /** Refresh tokens */
  async refreshTokens(refreshToken: string): Promise<Omit<AuthResult, 'user'>> {
    const tokenHash = hashToken(refreshToken);

    const result = await query(
      `SELECT rt.user_id, u.username, u.display_name, u.avatar_url, u.subscription_tier
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired refresh token');
    }

    const row = result.rows[0];

    // Delete old token
    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);

    // Issue new tokens
    const newAccessToken = await signAccessToken({
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      subscriptionTier: row.subscription_tier,
    });
    const newRefreshToken = await signRefreshToken(row.user_id, row.username);

    await this.storeRefreshToken(row.user_id, newRefreshToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiry: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000,
    };
  }

  /** Logout */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    } else {
      await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    }
    logger.info(`User logged out: ${userId}`);
  }

  /** Get user by ID */
  async getUserById(userId: string): Promise<CentralUser | null> {
    const result = await query(
      `SELECT id, username, email, display_name, avatar_url, status, status_message,
              mfa_enabled, subscription_tier, subscription_expires_at, created_at, is_verified
       FROM users WHERE id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return null;
    return this.mapUser(result.rows[0]);
  }

  /** Update user profile */
  async updateProfile(userId: string, updates: {
    displayName?: string;
    avatarUrl?: string | null;
    statusMessage?: string;
  }): Promise<CentralUser> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (updates.displayName !== undefined) {
      setClauses.push(`display_name = $${paramIdx++}`);
      values.push(updates.displayName);
    }
    if (updates.avatarUrl !== undefined) {
      setClauses.push(`avatar_url = $${paramIdx++}`);
      values.push(updates.avatarUrl);
    }
    if (updates.statusMessage !== undefined) {
      setClauses.push(`status_message = $${paramIdx++}`);
      values.push(updates.statusMessage);
    }

    if (setClauses.length === 0) {
      const user = await this.getUserById(userId);
      if (!user) throw new Error('User not found');
      return user;
    }

    values.push(userId);
    const result = await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIdx}
       RETURNING id, username, email, display_name, avatar_url, status, status_message,
                 mfa_enabled, subscription_tier, subscription_expires_at, created_at, is_verified`,
      values
    );

    if (result.rows.length === 0) throw new Error('User not found');
    return this.mapUser(result.rows[0]);
  }

  /** Store hashed refresh token */
  private async storeRefreshToken(
    userId: string, token: string, deviceInfo?: string, ipAddress?: string
  ): Promise<void> {
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, tokenHash, deviceInfo, ipAddress, expiresAt]
    );
  }

  /** Log audit event */
  private async logAuditEvent(
    userId: string | null, action: string, targetType?: string,
    targetId?: string | null, details?: object | null, ipAddress?: string
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, action, targetType, targetId, details ? JSON.stringify(details) : null, ipAddress]
      );
    } catch (error) {
      logger.error('Failed to log audit event:', error);
    }
  }

  /** Set up MFA for a user — generates secret and QR code */
  async setupMFA(userId: string): Promise<{ qrCodeUrl: string; secret: string }> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    if (user.mfaEnabled) throw new Error('MFA is already enabled');

    const secret = authenticator.generateSecret();

    // Store temporary secret (not yet verified)
    await query(
      'UPDATE users SET mfa_secret = $1 WHERE id = $2',
      [secret, userId]
    );

    const otpauthUrl = authenticator.keyuri(user.email || user.username, 'Stellarity', secret);
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return { qrCodeUrl, secret };
  }

  /** Verify MFA setup — enable MFA after user confirms with a valid code */
  async verifyMFASetup(userId: string, code: string): Promise<{ enabled: boolean; backupCodes: string[] }> {
    const result = await query(
      'SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) throw new Error('User not found');
    const row = result.rows[0];
    if (row.mfa_enabled) throw new Error('MFA is already enabled');
    if (!row.mfa_secret) throw new Error('MFA setup not initiated');

    const isValid = authenticator.verify({ token: code, secret: row.mfa_secret });
    if (!isValid) throw new Error('Invalid MFA code');

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Hash backup codes for storage
    const hashedCodes = backupCodes.map(c => crypto.createHash('sha256').update(c).digest('hex'));

    await query(
      'UPDATE users SET mfa_enabled = true, mfa_backup_codes = $1 WHERE id = $2',
      [JSON.stringify(hashedCodes), userId]
    );

    await this.logAuditEvent(userId, 'mfa_enabled', 'user', userId);
    logger.info(`MFA enabled for user: ${userId}`);

    return { enabled: true, backupCodes };
  }

  /** Verify MFA during login — validate TOTP code or backup code, return tokens */
  async verifyMFALogin(mfaToken: string, code: string, ipAddress?: string): Promise<AuthResult> {
    // Verify the temporary MFA token (which is a refresh-style JWT)
    const decoded = await verifyRefreshToken(mfaToken);
    if (!decoded) throw new Error('Invalid or expired MFA token');

    const userId = decoded.userId;
    const result = await query(
      `SELECT id, username, email, password_hash, display_name, avatar_url, status,
              status_message, mfa_enabled, mfa_secret, mfa_backup_codes,
              subscription_tier, subscription_expires_at, created_at, is_verified
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) throw new Error('User not found');
    const row = result.rows[0];

    if (!row.mfa_enabled || !row.mfa_secret) {
      throw new Error('MFA is not enabled for this account');
    }

    let valid = false;

    // Try TOTP code first
    if (/^\d{6}$/.test(code)) {
      valid = authenticator.verify({ token: code, secret: row.mfa_secret });
    }

    // Try backup code if TOTP didn't match
    if (!valid && row.mfa_backup_codes) {
      const hashedInput = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
      const backupCodes: string[] = JSON.parse(row.mfa_backup_codes);
      const codeIndex = backupCodes.indexOf(hashedInput);

      if (codeIndex !== -1) {
        valid = true;
        // Remove used backup code
        backupCodes.splice(codeIndex, 1);
        await query(
          'UPDATE users SET mfa_backup_codes = $1 WHERE id = $2',
          [JSON.stringify(backupCodes), userId]
        );
        logger.info(`Backup code used for user: ${userId}, ${backupCodes.length} remaining`);
      }
    }

    if (!valid) {
      await this.logAuditEvent(userId, 'mfa_failed', 'user', userId, null, ipAddress);
      throw new Error('Invalid MFA code');
    }

    const user = this.mapUser(row);

    // Generate full auth tokens
    const accessToken = await signAccessToken({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      subscriptionTier: user.subscriptionTier,
    });
    const refreshToken = await signRefreshToken(user.id, user.username);

    await this.storeRefreshToken(user.id, refreshToken, undefined, ipAddress);
    await this.logAuditEvent(user.id, 'login_success', 'user', user.id, { mfa: true }, ipAddress);

    logger.info(`MFA login successful for user: ${user.username}`);

    return {
      user,
      accessToken,
      refreshToken,
      accessTokenExpiry: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000,
    };
  }

  /** Disable MFA for a user */
  async disableMFA(userId: string, code: string): Promise<void> {
    const result = await query(
      'SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) throw new Error('User not found');
    const row = result.rows[0];
    if (!row.mfa_enabled) throw new Error('MFA is not enabled');

    // Require valid TOTP code to disable
    const isValid = authenticator.verify({ token: code, secret: row.mfa_secret });
    if (!isValid) throw new Error('Invalid MFA code');

    await query(
      'UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_backup_codes = NULL WHERE id = $1',
      [userId]
    );

    await this.logAuditEvent(userId, 'mfa_disabled', 'user', userId);
    logger.info(`MFA disabled for user: ${userId}`);
  }

  /** Map DB row to CentralUser */
  private mapUser(row: any): CentralUser {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      status: row.status,
      statusMessage: row.status_message,
      createdAt: row.created_at,
      isVerified: row.is_verified,
      subscriptionTier: row.subscription_tier || 'free',
      subscriptionExpiresAt: row.subscription_expires_at,
      mfaEnabled: row.mfa_enabled || false,
    };
  }
}

export const authService = new AuthService();
