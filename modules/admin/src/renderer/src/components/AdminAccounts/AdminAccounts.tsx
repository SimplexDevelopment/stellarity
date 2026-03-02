import React, { useEffect, useState, useCallback } from 'react'
import { adminApi } from '../../utils/adminApi'
import { useAdminAuthStore } from '../../stores/adminAuthStore'
import { useAdminUIStore } from '../../stores/adminUIStore'
import {
  RefreshIcon,
  PlusIcon,
  TrashIcon,
  ShieldIcon,
} from '../Icons'
import '../UserManagement/UserManagement.css'
import './AdminAccounts.css'

interface AdminAccount {
  id: string
  username: string
  display_name: string | null
  role: 'superadmin' | 'admin'
  mfa_enabled: boolean
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

export const AdminAccounts: React.FC = () => {
  const [admins, setAdmins] = useState<AdminAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'superadmin'>('admin')
  const [createError, setCreateError] = useState('')

  const currentAdmin = useAdminAuthStore((s) => s.admin)
  const showConfirm = useAdminUIStore((s) => s.showConfirmDialog)

  const fetchAdmins = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.admins.list()
      setAdmins(res.admins)
    } catch (err) {
      console.error('Failed to fetch admin accounts', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAdmins()
  }, [fetchAdmins])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')
    try {
      await adminApi.admins.create({ username: newUsername, password: newPassword, role: newRole })
      setShowCreate(false)
      setNewUsername('')
      setNewPassword('')
      setNewRole('admin')
      fetchAdmins()
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create admin')
    }
  }

  const handleRemove = (admin: AdminAccount) => {
    if (admin.id === currentAdmin?.id) return
    showConfirm({
      title: 'Remove Admin Account',
      message: `Permanently remove admin "${admin.username}"? This cannot be undone.`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        await adminApi.admins.remove(admin.id)
        fetchAdmins()
      },
    })
  }

  const handleRoleChange = (admin: AdminAccount, role: 'admin' | 'superadmin') => {
    if (admin.id === currentAdmin?.id) return
    showConfirm({
      title: 'Change Admin Role',
      message: `Change ${admin.username}'s role to ${role}?`,
      confirmLabel: 'Update Role',
      variant: 'warning',
      onConfirm: async () => {
        await adminApi.admins.updateRole(admin.id, { role })
        fetchAdmins()
      },
    })
  }

  return (
    <div className="admin-accounts">
      <div className="view-header">
        <h2 className="view-title">Admin Accounts</h2>
        <span className="view-count">{admins.length} admins</span>
        <button className="btn btn--ghost" onClick={fetchAdmins} disabled={loading}>
          <RefreshIcon size={14} />
        </button>
        <button className="btn btn--sm btn--primary" onClick={() => setShowCreate(true)}>
          <PlusIcon size={13} /> New Admin
        </button>
      </div>

      {showCreate && (
        <form className="create-admin-form" onSubmit={handleCreate}>
          <h3>Create Admin Account</h3>
          {createError && <div className="form-error">{createError}</div>}
          <div className="form-row">
            <label>
              Username
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="admin_username"
                required
                minLength={3}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={12}
              />
            </label>
            <label>
              Role
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'admin' | 'superadmin')}>
                <option value="admin">Admin</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn--primary">Create</button>
            <button type="button" className="btn btn--ghost" onClick={() => { setShowCreate(false); setCreateError('') }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="view-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>MFA</th>
              <th>Status</th>
              <th>Created</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.id} className={admin.id === currentAdmin?.id ? 'row--self' : ''}>
                <td>
                  <span className="admin-name">
                    <ShieldIcon size={14} />
                    {admin.display_name || admin.username}
                  </span>
                  {admin.id === currentAdmin?.id && <span className="badge badge--accent">You</span>}
                </td>
                <td>
                  <select
                    className="role-select"
                    value={admin.role}
                    onChange={(e) => handleRoleChange(admin, e.target.value as 'admin' | 'superadmin')}
                    disabled={admin.id === currentAdmin?.id}
                  >
                    <option value="admin">Admin</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </td>
                <td>
                  <span className={`badge badge--${admin.mfa_enabled ? 'success' : 'warning'}`}>
                    {admin.mfa_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td>
                  <span className={`badge badge--${admin.is_active ? 'success' : 'danger'}`}>
                    {admin.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="mono">{new Date(admin.created_at).toLocaleDateString()}</td>
                <td className="mono">{admin.last_login_at ? new Date(admin.last_login_at).toLocaleDateString() : '—'}</td>
                <td>
                  <div className="action-btns">
                    <button
                      className="btn btn--sm btn--danger"
                      onClick={() => handleRemove(admin)}
                      disabled={admin.id === currentAdmin?.id}
                      title="Remove"
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
