import React, { useEffect, useState, useCallback } from 'react'
import { adminApi } from '../../utils/adminApi'
import { useAdminUIStore } from '../../stores/adminUIStore'
import {
  RefreshIcon,
  TrashIcon,
  DatabaseIcon,
  MailIcon,
} from '../Icons'
import '../UserManagement/UserManagement.css'
import './DmBuffer.css'

interface DmBufferStats {
  totalConversations: number
  totalMessages: number
  oldestMessage: string | null
  newestMessage: string | null
  conversations: {
    conversation_id: string
    participant1_id: string
    participant2_id: string
    message_count: number
    oldest_message: string
    newest_message: string
  }[]
}

export const DmBuffer: React.FC = () => {
  const [stats, setStats] = useState<DmBufferStats | null>(null)
  const [loading, setLoading] = useState(false)
  const showConfirm = useAdminUIStore((s) => s.showConfirmDialog)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.metrics.dmBuffer()
      setStats(res)
    } catch (err) {
      console.error('Failed to fetch DM buffer stats', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const handlePurge = (conversationId: string) => {
    showConfirm({
      title: 'Purge Conversation Buffer',
      message: `Delete all buffered messages for conversation ${conversationId.slice(0, 8)}…? This cannot be undone.`,
      confirmLabel: 'Purge',
      variant: 'danger',
      onConfirm: async () => {
        await adminApi.metrics.purgeDmBuffer(conversationId)
        fetchStats()
      },
    })
  }

  const handlePurgeExpired = () => {
    showConfirm({
      title: 'Purge Expired Messages',
      message: 'Delete all expired buffered DM messages across all conversations?',
      confirmLabel: 'Purge Expired',
      variant: 'danger',
      onConfirm: async () => {
        await adminApi.metrics.purgeExpiredDmBuffers()
        fetchStats()
      },
    })
  }

  return (
    <div className="dm-buffer">
      <div className="view-header">
        <h2 className="view-title">DM Buffer</h2>
        <button className="btn btn--ghost" onClick={fetchStats} disabled={loading}>
          <RefreshIcon size={14} />
        </button>
        <button className="btn btn--sm btn--danger" onClick={handlePurgeExpired}>
          <TrashIcon size={13} /> Purge Expired
        </button>
      </div>

      {stats && (
        <div className="dm-buffer__stats">
          <div className="stat-card">
            <span className="stat-card__label">Conversations</span>
            <span className="stat-card__value">{stats.totalConversations}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Buffered Messages</span>
            <span className="stat-card__value">{stats.totalMessages}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Oldest Message</span>
            <span className="stat-card__value mono">{stats.oldestMessage ? new Date(stats.oldestMessage).toLocaleDateString() : '—'}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Newest Message</span>
            <span className="stat-card__value mono">{stats.newestMessage ? new Date(stats.newestMessage).toLocaleDateString() : '—'}</span>
          </div>
        </div>
      )}

      <div className="view-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Conversation</th>
              <th>Participant 1</th>
              <th>Participant 2</th>
              <th>Messages</th>
              <th>Oldest</th>
              <th>Newest</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stats?.conversations.map((conv) => (
              <tr key={conv.conversation_id}>
                <td className="mono">{conv.conversation_id.slice(0, 12)}…</td>
                <td className="mono">{conv.participant1_id.slice(0, 12)}…</td>
                <td className="mono">{conv.participant2_id.slice(0, 12)}…</td>
                <td>{conv.message_count}</td>
                <td className="mono">{new Date(conv.oldest_message).toLocaleDateString()}</td>
                <td className="mono">{new Date(conv.newest_message).toLocaleDateString()}</td>
                <td>
                  <div className="action-btns">
                    <button className="btn btn--sm btn--danger" onClick={() => handlePurge(conv.conversation_id)} title="Purge">
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!stats || stats.conversations.length === 0) && !loading && (
              <tr>
                <td colSpan={7} className="empty-state">
                  <DatabaseIcon size={24} />
                  <span>No buffered DM conversations</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
