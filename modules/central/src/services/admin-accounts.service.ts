/**
 * Admin Accounts Service
 * 
 * Superadmin-only: manage other admin accounts.
 */
import { query } from '../database/postgres.js';
import { hashPassword } from '../utils/password.js';

class AdminAccountsService {

  async list(): Promise<any[]> {
    const result = await query(
      `SELECT id, username, display_name, role, mfa_enabled, is_active, created_at, last_login_at
       FROM admins ORDER BY created_at ASC`
    );
    return result.rows.map(this.sanitize);
  }

  async create(data: {
    username: string;
    password: string;
    displayName?: string;
    role?: 'admin' | 'superadmin';
  }): Promise<any> {
    // Check uniqueness
    const existing = await query(
      'SELECT id FROM admins WHERE LOWER(username) = LOWER($1)',
      [data.username]
    );
    if (existing.rows.length > 0) throw new Error('Admin username already exists');

    const passwordHash = await hashPassword(data.password);

    const result = await query(
      `INSERT INTO admins (username, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.username.toLowerCase(), passwordHash, data.displayName || data.username, data.role || 'admin']
    );

    return this.sanitize(result.rows[0]);
  }

  async remove(adminId: string, requestingAdminId: string): Promise<void> {
    if (adminId === requestingAdminId) {
      throw new Error('Cannot delete your own admin account');
    }

    const result = await query('DELETE FROM admins WHERE id = $1', [adminId]);
    if (result.rowCount === 0) throw new Error('Admin not found');

    // Also clean up tokens
    await query('DELETE FROM admin_refresh_tokens WHERE admin_id = $1', [adminId]);
  }

  async updateRole(adminId: string, role: 'admin' | 'superadmin', requestingAdminId: string): Promise<any> {
    if (adminId === requestingAdminId) {
      throw new Error('Cannot change your own role');
    }

    const result = await query(
      'UPDATE admins SET role = $1 WHERE id = $2 RETURNING *',
      [role, adminId]
    );

    if (result.rows.length === 0) throw new Error('Admin not found');
    return this.sanitize(result.rows[0]);
  }

  private sanitize(row: any): any {
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      mfaEnabled: row.mfa_enabled,
      isActive: row.is_active,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    };
  }
}

export const adminAccountsService = new AdminAccountsService();
