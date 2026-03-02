import React, { useState, useEffect, useRef } from 'react'
import { useServerStore } from '../../stores/serverStore'
import { useMessageStore, Message } from '../../stores/messageStore'
import { useAuthStore } from '../../stores/authStore'
import { instanceManager } from '../../utils/instanceManager'
import {
  HashIcon,
  SendIcon,
  ChevronIcon,
  EditIcon,
  TrashIcon,
  DiamondIcon,
} from '../Icons'
import './ChatView.css'

/* ── helpers ──────────────────────────────────────────── */
const formatTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/* ── MobileMessage ────────────────────────────────────── */
const MobileMessage: React.FC<{
  message: Message
  isOwn: boolean
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
}> = ({ message, isOwn, onEdit, onDelete }) => {
  const [showActions, setShowActions] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTouchStart = () => {
    if (!isOwn) return
    longPressRef.current = setTimeout(() => setShowActions(true), 500)
  }

  const handleTouchEnd = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current)
  }

  const handleEdit = () => {
    if (editContent.trim() && editContent !== message.content) onEdit(message.id, editContent)
    setEditing(false)
    setShowActions(false)
  }

  return (
    <div
      className={`m-msg ${isOwn ? 'm-msg--own' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div className="m-msg__avatar avatar">
        {message.author?.avatarUrl ? (
          <img src={message.author.avatarUrl} alt="" />
        ) : (
          <span>{(message.author?.username || 'U')[0].toUpperCase()}</span>
        )}
      </div>

      <div className="m-msg__body">
        <div className="m-msg__header">
          <span className="m-msg__author">{message.author?.displayName || message.author?.username || 'Unknown'}</span>
          <span className="m-msg__time">{formatTime(message.createdAt)}</span>
          {message.editedAt && <span className="m-msg__edited">(edited)</span>}
        </div>

        {editing ? (
          <div className="m-msg__edit">
            <input
              type="text"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEdit()
                if (e.key === 'Escape') { setEditing(false); setShowActions(false) }
              }}
              autoFocus
            />
            <div className="m-msg__edit-actions">
              <button className="btn btn--primary btn--sm" onClick={handleEdit}>Save</button>
              <button className="btn btn--ghost btn--sm" onClick={() => { setEditing(false); setShowActions(false) }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="m-msg__text selectable">{message.content}</div>
        )}
      </div>

      {/* Long-press action sheet */}
      {showActions && !editing && (
        <div className="m-msg__actions-overlay" onClick={() => setShowActions(false)}>
          <div className="m-msg__actions" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setEditing(true); setEditContent(message.content) }}>
              <EditIcon size={16} /> Edit
            </button>
            <button className="m-msg__action--danger" onClick={() => { onDelete(message.id); setShowActions(false) }}>
              <TrashIcon size={16} /> Delete
            </button>
            <button onClick={() => setShowActions(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── ChatView ─────────────────────────────────────────── */
interface ChatViewProps {
  onBack: () => void
}

export const ChatView: React.FC<ChatViewProps> = ({ onBack }) => {
  const { currentChannelId, channels, currentServerId } = useServerStore()
  const { messages, loading, hasMore, typingUsers, setMessages, setLoading, setHasMore } = useMessageStore()
  const { user } = useAuthStore()

  const [inputValue, setInputValue] = useState('')
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentChannel = channels.find(c => c.id === currentChannelId)
  const channelMessages = currentChannelId ? messages[currentChannelId] || [] : []
  const channelTyping = currentChannelId ? typingUsers[currentChannelId] || [] : []

  const getConn = () => {
    const instanceId = useServerStore.getState().currentInstanceId
    return instanceId ? instanceManager.getInstance(instanceId) : undefined
  }

  // Load messages on mount / channel change
  useEffect(() => {
    if (currentChannelId && !messages[currentChannelId]) loadMessages()
  }, [currentChannelId])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [channelMessages.length])

  const loadMessages = async () => {
    if (!currentChannelId) return
    const conn = getConn()
    if (!conn) return
    setLoading(true)
    try {
      const res = await conn.api.messages.get(currentChannelId, { limit: 50 })
      setMessages(currentChannelId, res)
      setHasMore(currentChannelId, res.length === 50)
    } catch (e) {
      console.error('Failed to load messages:', e)
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (!currentChannelId || loading || !hasMore[currentChannelId]) return
    const first = channelMessages[0]
    if (!first) return
    setLoading(true)
    try {
      const conn = getConn()
      if (!conn) return
      const res = await conn.api.messages.get(currentChannelId, { limit: 50, before: first.id })
      if (res.length > 0) useMessageStore.getState().prependMessages(currentChannelId, res)
      setHasMore(currentChannelId, res.length === 50)
    } catch (e) {
      console.error('Failed to load more:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0 && hasMore[currentChannelId!]) loadMore()
  }

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    if (currentChannelId) {
      const conn = getConn()
      conn?.socket.startTyping(currentChannelId)
      if (typingTimeout) clearTimeout(typingTimeout)
      const t = setTimeout(() => { if (currentChannelId) conn?.socket.stopTyping(currentChannelId) }, 2000)
      setTypingTimeout(t)
    }
  }

  const handleSend = () => {
    if (!inputValue.trim() || !currentChannelId) return
    const conn = getConn()
    conn?.socket.sendMessage(currentChannelId, inputValue.trim())
    setInputValue('')
    if (typingTimeout) clearTimeout(typingTimeout)
    conn?.socket.stopTyping(currentChannelId)
  }

  const handleEdit = (id: string, content: string) => { getConn()?.socket.editMessage(id, content) }
  const handleDelete = (id: string) => { if (currentChannelId) getConn()?.socket.deleteMessage(id, currentChannelId) }

  if (!currentChannel) return null

  return (
    <div className="m-chat">
      {/* Header */}
      <div className="mobile-header">
        <button className="mobile-header__back" onClick={onBack}>
          <ChevronIcon size={16} direction="left" />
        </button>
        <HashIcon size={14} className="m-chat__hash" />
        <span className="mobile-header__title">{currentChannel.name}</span>
      </div>

      {/* Messages */}
      <div className="m-chat__messages" ref={containerRef} onScroll={handleScroll}>
        {loading && channelMessages.length === 0 && (
          <div className="m-chat__loading">
            <DiamondIcon size={20} className="m-auth-spinner" />
            <span>Loading transmissions...</span>
          </div>
        )}

        {!loading && channelMessages.length === 0 && (
          <div className="m-chat__welcome">
            <HashIcon size={28} className="m-chat__welcome-icon" />
            <p>Welcome to #{currentChannel.name}</p>
          </div>
        )}

        {hasMore[currentChannelId!] && channelMessages.length > 0 && (
          <button className="btn btn--ghost btn--sm m-chat__load-more" onClick={loadMore} disabled={loading}>
            {loading ? 'Loading...' : 'Load older messages'}
          </button>
        )}

        {channelMessages.map(msg => (
          <MobileMessage
            key={msg.id}
            message={msg}
            isOwn={msg.userId === user?.id}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {channelTyping.length > 0 && (
        <div className="m-chat__typing">
          <span className="m-chat__typing-dots"><span /><span /><span /></span>
          {channelTyping.map(u => u.username).join(', ')}{' '}
          {channelTyping.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Input bar */}
      <div className="m-chat__input-bar">
        <input
          type="text"
          className="m-chat__input"
          placeholder={`Message #${currentChannel.name}`}
          value={inputValue}
          onChange={handleInput}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend() } }}
        />
        <button
          className="m-chat__send"
          onClick={handleSend}
          disabled={!inputValue.trim()}
        >
          <SendIcon size={18} />
        </button>
      </div>
    </div>
  )
}
