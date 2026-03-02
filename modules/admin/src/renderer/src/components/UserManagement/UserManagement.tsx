import React, { useEffect, useState, useCallback } from 'react'
import { adminApi } from '../../utils/adminApi'
import { useAdminUIStore } from '../../stores/adminUIStore'
import {
  SearchIcon,
  RefreshIcon,
  BanIcon,
  UnlockIcon,
  TrashIcon,
  EyeIcon,
  EditIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../Icons'
import './UserManagement.css'

interface UserRow {
  id: string
  username: string
  email: string
  display_name: string | null
  subscription_tier: string
  status: string
  is_suspended: boolean
  mfa_enabled: boolean
  created_at: string
  last_login_at: string | null
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(25)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [suspendedFilter, setSuspendedFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const { showConfirmDialog } = useAdminUIStore()

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.users.list({
        page,
        limit,
        search: search || undefined,
        tier: tierFilter || undefined,
        suspended: suspendedFilter || undefined,
      })
      setUsers(res.users)
      setTotal(res.total)
    } catch (err) {
      console.error('Failed to fetch users', err)
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, tierFilter, suspendedFilter])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const totalPages = Math.ceil(total / limit)

  const handleViewUser = async (userId: string) => {
    try {
      const res = await adminApi.users.get(userId)
      setSelectedUser(res.user)
      setDetailOpen(true)
    } catch (err) {
      console.error('Failed to fetch user', err)
    }
  }

  const handleSuspend = (user: UserRow) => {
    showConfirmDialog({
      title: 'Suspend User',
      message: `Suspend "${user.username}"? They will be unable to log in.`,
      confirmLabel: 'Suspend',
      variant: 'warning',
      onConfirm: async () => {
        try {
          await adminApi.users.suspend(user.id, 'Suspended by admin')
          fetchUsers()
        } catch (err) {
          console.error('Failed to suspend user', err)
        }
      },
    })
  }

  const handleUnsuspend = async (userId: string) => {
    try {
      await adminApi.users.unsuspend(userId)
      fetchUsers()
    } catch (err) {
      console.error('Failed to unsuspend user', err)
    }
  }

  const handleDelete = (user: UserRow) => {
    showConfirmDialog({
      title: 'Delete User',
      message: `Permanently delete "${user.username}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await adminApi.users.delete(user.id)
          fetchUsers()
        } catch (err) {
          console.error('Failed to delete user', err)
        }
      },
    })
  }

  const tierBadgeClass = (tier: string) => {
    switch (tier) {
      case 'pro': return 'badge badge--info'
      case 'enterprise': return 'badge badge--accent'
      default: return 'badge'
    }
  }

  return (
    <div className="user-management">
      <div className="view-header">
        <h2 className="view-title">User Management</h2>
        <span className="view-count">{total} users</span>
        <button className="btn btn--ghost" onClick={fetchUsers} disabled={loading}>
          <RefreshIcon size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filters */}
      <div className="view-filters">
        <div className="search-bar">
          <SearchIcon size={14} className="search-bar__icon" />
          <input
            className="search-bar__input"
            placeholder="Search users..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        <select value={tierFilter} onChange={(e) => { setTierFilter(e.target.value); setPage(1) }}>
          <option value="">All Tiers</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>

        <select value={suspendedFilter} onChange={(e) => { setSuspendedFilter(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          <option value="true">Suspended</option>
          <option value="false">Active</option>
        </select>
      </div>

      {/* Table */}
      <div className="view-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Tier</th>
              <th>Status</th>
              <th>MFA</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="text-primary">{user.username}</td>
                <td>{user.email}</td>
                <td><span className={tierBadgeClass(user.subscription_tier)}>{user.subscription_tier}</span></td>
                <td>
                  {user.is_suspended ? (
                    <span className="badge badge--danger">Suspended</span>
                  ) : (
                    <span className="badge badge--success">Active</span>
                  )}
                </td>
                <td>
                  {user.mfa_enabled ? (
                    <span className="text-success">ON</span>
                  ) : (
                    <span className="text-muted">OFF</span>
                  )}
                </td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="action-btns">
                    <button className="btn btn--icon" onClick={() => handleViewUser(user.id)} data-tooltip="View">
                      <EyeIcon size={14} />
                    </button>
                    {user.is_suspended ? (
                      <button className="btn btn--icon" onClick={() => handleUnsuspend(user.id)} data-tooltip="Unsuspend">
                        <UnlockIcon size={14} />
                      </button>
                    ) : (
                      <button className="btn btn--icon" onClick={() => handleSuspend(user)} data-tooltip="Suspend">
                        <BanIcon size={14} />
                      </button>
                    )}
                    <button className="btn btn--icon" onClick={() => handleDelete(user)} data-tooltip="Delete">
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
              <tr><td colSpan={7} className="text-muted" style={{ textAlign: 'center', padding: '24px' }}>No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button className="pagination__btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeftIcon size={12} />
          </button>
          <span>Page {page} of {totalPages}</span>
          <button className="pagination__btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRightIcon size={12} />
          </button>
        </div>
      )}

      {/* Detail Panel */}
      {detailOpen && selectedUser && (
        <div className="detail-overlay" onClick={() => setDetailOpen(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <span className="panel-header__label">User Detail</span>
              <button className="btn btn--ghost" onClick={() => setDetailOpen(false)}>Close</button>
            </div>
            <div className="detail-body">
              <div className="detail-row"><span className="detail-key">ID</span><span className="detail-val mono">{selectedUser.id}</span></div>
              <div className="detail-row"><span className="detail-key">Username</span><span className="detail-val">{selectedUser.username}</span></div>
              <div className="detail-row"><span className="detail-key">Email</span><span className="detail-val">{selectedUser.email}</span></div>
              <div className="detail-row"><span className="detail-key">Display Name</span><span className="detail-val">{selectedUser.display_name || '—'}</span></div>
              <div className="detail-row"><span className="detail-key">Tier</span><span className="detail-val">{selectedUser.subscription_tier}</span></div>
              <div className="detail-row"><span className="detail-key">Status</span><span className="detail-val">{selectedUser.status}</span></div>
              <div className="detail-row"><span className="detail-key">MFA</span><span className="detail-val">{selectedUser.mfa_enabled ? 'Enabled' : 'Disabled'}</span></div>
              <div className="detail-row"><span className="detail-key">Suspended</span><span className="detail-val">{selectedUser.is_suspended ? 'Yes' : 'No'}</span></div>
              <div className="detail-row"><span className="detail-key">Created</span><span className="detail-val">{new Date(selectedUser.created_at).toLocaleString()}</span></div>
              <div className="detail-row"><span className="detail-key">Last Login</span><span className="detail-val">{selectedUser.last_login_at ? new Date(selectedUser.last_login_at).toLocaleString() : '—'}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
