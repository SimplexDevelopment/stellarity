import React, { useEffect, useState, useCallback } from 'react'
import { adminApi } from '../../utils/adminApi'
import { useAdminUIStore } from '../../stores/adminUIStore'
import {
  RefreshIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
} from '../Icons'
import '../UserManagement/UserManagement.css'
import './SubscriptionManagement.css'

interface SubscriptionRow {
  user_id: string
  username: string
  display_name: string
  tier: string
  status: string
  max_instances: number
  started_at: string | null
  expires_at: string | null
}

interface SubStats {
  tierDistribution: Record<string, number> | { tier: string; count: number }[]
  statusDistribution: Record<string, number> | { status: string; count: number }[]
}

const TIERS = ['free', 'starter', 'pro', 'enterprise']

export const SubscriptionManagement: React.FC = () => {
  const [subs, setSubs] = useState<SubscriptionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(25)
  const [tierFilter, setTierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [stats, setStats] = useState<SubStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [newTier, setNewTier] = useState('')
  const showConfirm = useAdminUIStore((s) => s.showConfirmDialog)

  const fetchSubs = useCallback(async () => {
    setLoading(true)
    try {
      const [subRes, statsRes] = await Promise.all([
        adminApi.subscriptions.list({ page, limit, tier: tierFilter || undefined, status: statusFilter || undefined }),
        adminApi.subscriptions.stats(),
      ])
      setSubs(subRes.subscriptions)
      setTotal(subRes.total)
      setStats(statsRes)
    } catch (err) {
      console.error('Failed to fetch subscriptions', err)
    } finally {
      setLoading(false)
    }
  }, [page, limit, tierFilter, statusFilter])

  useEffect(() => {
    fetchSubs()
  }, [fetchSubs])

  const handleOverride = (userId: string, currentTier: string) => {
    setEditingUserId(userId)
    setNewTier(currentTier)
  }

  const confirmOverride = (userId: string, username: string) => {
    showConfirm({
      title: 'Override Subscription Tier',
      message: `Change ${username}'s tier to "${newTier}"?`,
      confirmLabel: 'Override',
      variant: 'warning',
      onConfirm: async () => {
        await adminApi.subscriptions.overrideTier(userId, newTier)
        setEditingUserId(null)
        fetchSubs()
      },
    })
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="subscription-mgmt">
      <div className="view-header">
        <h2 className="view-title">Subscriptions</h2>
        <span className="view-count">{total} users</span>
        <button className="btn btn--ghost" onClick={fetchSubs} disabled={loading}>
          <RefreshIcon size={14} />
        </button>
      </div>

      {stats && (
        <div className="sub-stats-row">
          {(Array.isArray(stats.tierDistribution)
            ? stats.tierDistribution
            : Object.entries(stats.tierDistribution).map(([tier, count]) => ({ tier, count }))
          ).map((t) => (
            <div key={t.tier} className={`stat-card stat-card--tier-${t.tier}`}>
              <span className="stat-card__label">{t.tier}</span>
              <span className="stat-card__value">{t.count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="view-filters">
        <select value={tierFilter} onChange={(e) => { setTierFilter(e.target.value); setPage(1) }}>
          <option value="">All Tiers</option>
          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="view-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Tier</th>
              <th>Status</th>
              <th>Max Instances</th>
              <th>Started</th>
              <th>Expires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((sub) => (
              <tr key={sub.user_id}>
                <td>
                  <span className="username">{sub.display_name || sub.username}</span>
                  <span className="sub-text">{sub.username}</span>
                </td>
                <td>
                  {editingUserId === sub.user_id ? (
                    <div className="tier-edit">
                      <select value={newTier} onChange={(e) => setNewTier(e.target.value)}>
                        {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button className="btn btn--sm btn--primary" onClick={() => confirmOverride(sub.user_id, sub.username)}>Save</button>
                      <button className="btn btn--sm btn--ghost" onClick={() => setEditingUserId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <span className={`badge badge--${sub.tier === 'enterprise' ? 'accent' : sub.tier === 'pro' ? 'info' : sub.tier === 'starter' ? 'success' : 'default'}`}>
                      {sub.tier}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`badge badge--${sub.status === 'active' ? 'success' : 'warning'}`}>
                    {sub.status}
                  </span>
                </td>
                <td>{sub.max_instances}</td>
                <td className="mono">{sub.started_at ? new Date(sub.started_at).toLocaleDateString() : '—'}</td>
                <td className="mono">{sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : '—'}</td>
                <td>
                  <div className="action-btns">
                    <button className="btn btn--sm btn--ghost" onClick={() => handleOverride(sub.user_id, sub.tier)} title="Override tier">
                      <EditIcon size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {subs.length === 0 && !loading && (
              <tr><td colSpan={7} className="text-muted" style={{ textAlign: 'center', padding: '24px' }}>No subscriptions found</td></tr>
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
