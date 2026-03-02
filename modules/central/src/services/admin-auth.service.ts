/**
 * Admin Auth Service
 * 
 * Handles admin authentication, token management, and MFA.
 * Admin accounts are stored in a separate `admins` table.
 */
import { query } from '../database/postgres.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  signAdminAccessToken,
  signAdminRefreshToken,
  verifyAdminRefreshToken,
  signAdminMfaToken,
  verifyAdminMfaToken,
  hashToken,
} from '../config/keys.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

class AdminAuthService {

  async login(username: string, password: string, ip?: string): Promise<{
    admin?: any;
    accessToken?: string;
    refreshToken?: string;
    mfaRequired?: boolean;
    mfaToken?: string;
  }> {
    const result = await query(
      'SELECT * FROM admins WHERE LOWER(username) = LOWER($1) AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      await this.logAudit(null, 'admin', 'admin_login_failed', 'admin', null, { username, reason: 'not_found' }, ip);
      throw new Error('Invalid credentials');
    }

    const admin = result.rows[0];
    const validPassword = await verifyPassword(password, admin.password_hash);

    if (!validPassword) {
      await this.logAudit(null, 'admin', 'admin_login_failed', 'admin', admin.id, { reason: 'bad_password' }, ip);
      throw new Error('Invalid credentials');
    }

    // Check MFA
    if (admin.mfa_enabled && admin.mfa_secret) {
      const mfaToken = await signAdminMfaToken(admin.id);
      return { mfaRequired: true, mfaToken };
    }

    // Issue tokens
    const accessToken = await signAdminAccessToken({
      id: admin.id,
      username: admin.username,
      role: admin.role,
    });
    const refreshToken = await signAdminRefreshToken(admin.id, admin.username);

    // Store refresh token hash
    const tokenHash = hashToken(refreshToken);
    await query(
      `INSERT INTO admin_refresh_tokens (admin_id, token_hash, ip_address, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [admin.id, tokenHash, ip]
    );

    // Update last login
    await query('UPDATE admins SET last_login_at = NOW() WHERE id = $1', [admin.id]);

    await this.logAudit(admin.id, 'admin', 'admin_login_success', 'admin', admin.id, null, ip);

    return {
      admin: this.sanitize(admin),
      accessToken,
      refreshToken,
    };
  }

  async verifyMfaLogin(mfaToken: string, code: string, ip?: string): Promise<{
    admin: any;
    accessToken: string;
    refreshToken: string;
  }> {
    const adminId = await verifyAdminMfaToken(mfaToken);
    if (!adminId) throw new Error('Invalid or expired MFA token');

    const result = await query('SELECT * FROM admins WHERE id = $1 AND is_active = true', [adminId]);
    if (result.rows.length === 0) throw new Error('Admin not found');

    const admin = result.rows[0];

    // Verify TOTP code
    const { authenticator } = await import('otplib');
    const isValid = authenticator.verify({ token: code, secret: admin.mfa_secret });

    if (!isValid) {
      // Try backup codes
      const backupCodes: string[] = admin.mfa_backup_codes || [];
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      const codeIndex = backupCodes.indexOf(codeHash);

      if (codeIndex === -1) {
        await this.logAudit(admin.id, 'admin', 'admin_mfa_failed', 'admin', admin.id, null, ip);
        throw new Error('Invalid MFA code');
      }

      // Remove used backup code
      backupCodes.splice(codeIndex, 1);
      await query('UPDATE admins SET mfa_backup_codes = $1 WHERE id = $2', [
        JSON.stringify(backupCodes),
        admin.id,
      ]);
    }

    const accessToken = await signAdminAccessToken({
      id: admin.id,
      username: admin.username,
      role: admin.role,
    });
    const refreshToken = await signAdminRefreshToken(admin.id, admin.username);

    const tokenHash = hashToken(refreshToken);
    await query(
      `INSERT INTO admin_refresh_tokens (admin_id, token_hash, ip_address, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [admin.id, tokenHash, ip]
    );

    await query('UPDATE admins SET last_login_at = NOW() WHERE id = $1', [admin.id]);
    await this.logAudit(admin.id, 'admin', 'admin_login_success', 'admin', admin.id, { mfa: true }, ip);

    return {
      admin: this.sanitize(admin),
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string, ip?: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const verified = await verifyAdminRefreshToken(refreshToken);
    if (!verified) throw new Error('Invalid refresh token');

    const tokenHash = hashToken(refreshToken);
    const tokenResult = await query(
      'SELECT * FROM admin_refresh_tokens WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) throw new Error('Refresh token not found or expired');

    // Revoke old token
    await query('DELETE FROM admin_refresh_tokens WHERE token_hash = $1', [tokenHash]);

    // Get admin
    const adminResult = await query('SELECT * FROM admins WHERE id = $1 AND is_active = true', [verified.adminId]);
    if (adminResult.rows.length === 0) throw new Error('Admin not found');

    const admin = adminResult.rows[0];

    // Issue new tokens
    const newAccessToken = await signAdminAccessToken({
      id: admin.id,
      username: admin.username,
      role: admin.role,
    });
    const newRefreshToken = await signAdminRefreshToken(admin.id, admin.username);

    const newHash = hashToken(newRefreshToken);
    await query(
      `INSERT INTO admin_refresh_tokens (admin_id, token_hash, ip_address, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [admin.id, newHash, ip]
    );

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(adminId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query('DELETE FROM admin_refresh_tokens WHERE token_hash = $1', [tokenHash]);
    } else {
      await query('DELETE FROM admin_refresh_tokens WHERE admin_id = $1', [adminId]);
    }
  }

  async getProfile(adminId: string): Promise<any> {
    const result = await query('SELECT * FROM admins WHERE id = $1', [adminId]);
    if (result.rows.length === 0) throw new Error('Admin not found');
    return this.sanitize(result.rows[0]);
  }

  async setupMfa(adminId: string): Promise<{ qrCodeUrl: string; secret: string }> {
    const { authenticator } = await import('otplib');
    const qrcode = await import('qrcode');

    const secret = authenticator.generateSecret();
    const admin = await this.getProfile(adminId);
    const otpauth = authenticator.keyuri(admin.username, 'Stellarity Admin', secret);

    await query('UPDATE admins SET mfa_secret = $1 WHERE id = $2', [secret, adminId]);

    const qrCodeUrl = await qrcode.toDataURL(otpauth);
    return { qrCodeUrl, secret };
  }

  async verifyMfa(adminId: string, code: string): Promise<{ enabled: boolean; backupCodes: string[] }> {
    const result = await query('SELECT mfa_secret FROM admins WHERE id = $1', [adminId]);
    if (result.rows.length === 0) throw new Error('Admin not found');

    const { authenticator } = await import('otplib');
    const isValid = authenticator.verify({ token: code, secret: result.rows[0].mfa_secret });
    if (!isValid) throw new Error('Invalid MFA code');

    // Generate backup codes
    const backupCodes: string[] = [];
    const backupHashes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex');
      backupCodes.push(code);
      backupHashes.push(crypto.createHash('sha256').update(code).digest('hex'));
    }

    await query(
      'UPDATE admins SET mfa_enabled = true, mfa_backup_codes = $1 WHERE id = $2',
      [JSON.stringify(backupHashes), adminId]
    );

    await this.logAudit(adminId, 'admin', 'admin_mfa_enabled', 'admin', adminId, null, null);

    return { enabled: true, backupCodes };
  }

  async disableMfa(adminId: string, code: string): Promise<void> {
    const result = await query('SELECT mfa_secret FROM admins WHERE id = $1', [adminId]);
    if (result.rows.length === 0) throw new Error('Admin not found');

    const { authenticator } = await import('otplib');
    const isValid = authenticator.verify({ token: code, secret: result.rows[0].mfa_secret });
    if (!isValid) throw new Error('Invalid MFA code');

    await query(
      'UPDATE admins SET mfa_enabled = false, mfa_secret = NULL, mfa_backup_codes = \'[]\'::jsonb WHERE id = $1',
      [adminId]
    );

    await this.logAudit(adminId, 'admin', 'admin_mfa_disabled', 'admin', adminId, null, null);
  }

  async changePassword(adminId: string, currentPassword: string, newPassword: string): Promise<void> {
    const result = await query('SELECT password_hash FROM admins WHERE id = $1', [adminId]);
    if (result.rows.length === 0) throw new Error('Admin not found');

    const valid = await verifyPassword(currentPassword, result.rows[0].password_hash);
    if (!valid) throw new Error('Current password is incorrect');

    const hash = await hashPassword(newPassword);
    await query('UPDATE admins SET password_hash = $1 WHERE id = $2', [hash, adminId]);

    // Revoke all refresh tokens
    await query('DELETE FROM admin_refresh_tokens WHERE admin_id = $1', [adminId]);

    await this.logAudit(adminId, 'admin', 'admin_password_changed', 'admin', adminId, null, null);
  }

  private sanitize(admin: any): any {
    return {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name,
      role: admin.role,
      mfaEnabled: admin.mfa_enabled,
      isActive: admin.is_active,
      createdAt: admin.created_at,
      lastLoginAt: admin.last_login_at,
    };
  }

  private async logAudit(
    userId: string | null,
    actorType: string,
    action: string,
    targetType: string,
    targetId: string | null,
    details: any,
    ip: string | null | undefined
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO audit_logs (user_id, actor_type, actor_id, action, target_type, target_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, actorType, userId, action, targetType, targetId, details ? JSON.stringify(details) : null, ip]
      );
    } catch (error) {
      logger.error('Failed to write audit log:', error);
    }
  }
}

export const adminAuthService = new AdminAuthService();
