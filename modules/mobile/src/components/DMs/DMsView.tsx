import React from 'react'
import { useDMStore } from '../../stores/dmStore'
import { useAuthStore } from '../../stores/authStore'
import { MessageIcon, DiamondIcon } from '../Icons'
import './DMsView.css'

const formatLastMessage = (dateStr: string | null) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export const DMsView: React.FC = () => {
  const { conversations, isLoading } = useDMStore()
  const { user } = useAuthStore()

  return (
    <div className="m-dms">
      <div className="mobile-header">
        <span className="mobile-header__title">MESSAGES</span>
      </div>

      <div className="m-dms__list">
        {isLoading ? (
          <div className="m-dms__loading">
            <DiamondIcon size={20} className="m-auth-spinner" />
            <span>Loading conversations...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="m-dms__empty">
            <MessageIcon size={36} className="m-dms__empty-icon" />
            <p>No direct messages</p>
            <span>Conversations will appear here</span>
          </div>
        ) : (
          conversations.map(conv => {
            const other = conv.participants.find(p => p.id !== user?.id) || conv.participants[0]
            return (
              <button key={conv.id} className="m-dm-item">
                <div className="m-dm-item__avatar">
                  {other?.avatarUrl ? (
                    <img src={other.avatarUrl} alt="" />
                  ) : (
                    <span>{(other?.displayName || other?.username || 'U')[0].toUpperCase()}</span>
                  )}
                  <div className={`m-dm-item__status m-dm-item__status--${other?.status || 'offline'}`} />
                </div>
                <div className="m-dm-item__info">
                  <span className="m-dm-item__name">{other?.displayName || other?.username || 'User'}</span>
                  {other?.statusMessage && (
                    <span className="m-dm-item__status-msg">{other.statusMessage}</span>
                  )}
                </div>
                <div className="m-dm-item__meta">
                  <span className="m-dm-item__time">{formatLastMessage(conv.lastMessageAt)}</span>
                  {conv.unreadCount > 0 && (
                    <span className="m-dm-item__badge">{conv.unreadCount}</span>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
