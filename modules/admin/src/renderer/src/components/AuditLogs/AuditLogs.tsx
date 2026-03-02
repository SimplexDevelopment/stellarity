import React, { useEffect, useState, useCallback } from 'react'
import { adminApi } from '../../utils/adminApi'
import {
  SearchIcon,
  RefreshIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterIcon,
} from '../Icons'
import '../UserManagement/UserManagement.css'
import './AuditLogs.css'

interface AuditLogRow {
  id: string
  user_id: string
  username?: string
  action: string
  target_type: string | null
  target_id: string | null
  details: any
  ip_address: string | null
  actor_type: string | null
  actor_id: string | null
  created_at: string
}

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [actionFilter, setActionFilter] = useState('')
  const [actorTypeFilter, setActorTypeFilter] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.auditLogs.list({
        page,
        limit,
        action: actionFilter || undefined,
        actorType: actorTypeFilter || undefined,
      })
      setLogs(res.logs)
      setTotal(res.total)
    } catch (err) {
      console.error('Failed to fetch audit logs', err)
    } finally {
      setLoading(false)
    }
  }, [page, limit, actionFilter, actorTypeFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const totalPages = Math.ceil(total / limit)

  const actionColor = (action: string) => {
    if (action.includes('delete') || action.includes('suspend') || action.includes('ban')) return 'text-danger'
    if (action.includes('create') || action.includes('register')) return 'text-success'
    if (action.includes('login')) return 'text-info'
    return 'text-secondary'
  }

  return (
    <div className="audit-logs">
      <div className="view-header">
        <h2 className="view-title">Audit Logs</h2>
        <span className="view-count">{total} entries</span>
        <button className="btn btn--ghost" onClick={fetchLogs} disabled={loading}>
          <RefreshIcon size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="view-filters">
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}>
          <option value="">All Actions</option>
          <option value="login">Login</option>
          <option value="login_failed">Login Failed</option>
          <option value="register">Register</option>
          <option value="profile_update">Profile Update</option>
          <option value="mfa_enabled">MFA Enabled</option>
          <option value="mfa_disabled">MFA Disabled</option>
          <option value="instance_registered">Instance Registered</option>
          <option value="instance_removed">Instance Removed</option>
          <option value="subscription_updated">Subscription Updated</option>
          <option value="account_suspended">Account Suspended</option>
        </select>

        <select value={actorTypeFilter} onChange={(e) => { setActorTypeFilter(e.target.value); setPage(1) }}>
          <option value="">All Actors</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="system">System</option>
        </select>
      </div>

      <div className="view-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Actor</th>
              <th>User</th>
              <th>Target</th>
              <th>IP</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="mono">{new Date(log.created_at).toLocaleString()}</td>
                <td><span className={actionColor(log.action)}>{log.action}</span></td>
                <td className="mono">{log.actor_type || 'user'}</td>
                <td>{log.username || log.user_id?.slice(0, 8) || '—'}</td>
                <td className="mono">{log.target_type ? `${log.target_type}:${log.target_id?.slice(0, 8)}` : '—'}</td>
                <td className="mono">{log.ip_address || '—'}</td>
                <td className="mono">{log.details ? JSON.stringify(log.details).slice(0, 50) : '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && !loading && (
              <tr><td colSpan={7} className="text-muted" style={{ textAlign: 'center', padding: '24px' }}>No audit logs found</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
    </div>
  )
}
