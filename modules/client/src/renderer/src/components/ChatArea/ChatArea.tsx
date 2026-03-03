import React, { useState, useEffect, useRef } from 'react'
import { useServerStore } from '../../stores/serverStore'
import { useMessageStore, Message } from '../../stores/messageStore'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { useVoiceStore } from '../../stores/voiceStore'
import { instanceManager } from '../../utils/instanceManager'
import { voiceManager } from '../../utils/voiceManager'
import { VoiceChannel } from '../VoiceChannel/VoiceChannel'
import {
  HashIcon,
  PinIcon,
  UsersIcon,
  SearchIcon,
  SendIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  DiamondIcon,
  SignalIcon,
  WaveformIcon,
  MicIcon,
  MicOffIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  PhoneOffIcon,
} from '../Icons'
import './ChatArea.css'

/* ── helpers ──────────────────────────────────────────── */
const formatTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

/* ── MessageItem ──────────────────────────────────────── */
const formatTimeShort = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Check if two messages should be visually grouped (same author, within 3 min) */
const shouldGroup = (prev: Message | undefined, cur: Message): boolean => {
  if (!prev) return false
  if (prev.userId !== cur.userId) return false
  const gap = new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime()
  return gap < 3 * 60 * 1000 // 3 minutes
}

const MessageItem: React.FC<{
  message: Message
  isOwn: boolean
  isGrouped: boolean
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
  onPin: (id: string) => void
  onUnpin: (id: string) => void
  onClickAuthor?: (userId: string) => void
}> = ({ message, isOwn, isGrouped, onEdit, onDelete, onPin, onUnpin, onClickAuthor }) => {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [showActions, setShowActions] = useState(false)

  const handleEdit = () => {
    if (editContent.trim() && editContent !== message.content) onEdit(message.id, editContent)
    setEditing(false)
  }

  return (
    <div
      className={`msg ${isOwn ? 'msg--own' : ''} ${isGrouped ? 'msg--grouped' : ''} ${message.pinned ? 'msg--pinned' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {isGrouped ? (
        <div className="msg__avatar-spacer" />
      ) : (
        <div className="msg__avatar avatar" onClick={() => onClickAuthor?.(message.userId)} role="button" tabIndex={0}>
          {message.author?.avatarUrl ? (
            <img src={message.author.avatarUrl} alt="" />
          ) : (
            <span>{(message.author?.username || 'U')[0].toUpperCase()}</span>
          )}
        </div>
      )}

      <div className="msg__body">
        {!isGrouped && (
          <div className="msg__header">
            <span className="msg__author" onClick={() => onClickAuthor?.(message.userId)} role="button" tabIndex={0}>{message.author?.displayName || message.author?.username || 'Unknown'}</span>
            <span className="msg__time">{formatTime(message.createdAt)}</span>
            {message.editedAt && <span className="msg__edited">(edited)</span>}
          </div>
        )}

        {editing ? (
          <div className="msg__edit">
            <input
              type="text"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
              autoFocus
            />
            <div className="msg__edit-actions">
              <button className="btn btn--primary btn--sm" onClick={handleEdit}>Save</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="msg__text">
            {message.content}
            {isGrouped && message.editedAt && <span className="msg__edited"> (edited)</span>}
          </div>
        )}
      </div>

      {isGrouped && !(showActions && !editing) && (
        <span className="msg__hover-time">{formatTimeShort(message.createdAt)}</span>
      )}
      {showActions && !editing && (
        <div className="msg__actions">
          <button
            onClick={() => message.pinned ? onUnpin(message.id) : onPin(message.id)}
            data-tooltip={message.pinned ? 'Unpin' : 'Pin'}
          >
            <PinIcon size={14} />
          </button>
          {isOwn && (
            <>
              <button onClick={() => setEditing(true)} data-tooltip="Edit"><EditIcon size={14} /></button>
              <button onClick={() => onDelete(message.id)} data-tooltip="Delete"><TrashIcon size={14} /></button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── ChatEmptyOrVoice ─────────────────────────────────── */
/** Shows voice active panel when connected, otherwise the default empty state */
const ChatEmptyOrVoice: React.FC = () => {
  const { user } = useAuthStore()
  const { channels } = useServerStore()
  const { openProfile } = useUIStore()
  const {
    isConnected,
    currentChannelId: voiceChannelId,
    channelUsers,
    selfMute,
    selfDeaf,
    isSpeaking,
    connectionQualities,
  } = useVoiceStore()

  if (!isConnected || !voiceChannelId) {
    return (
      <div className="chat chat--empty">
        <div className="chat-empty-state">
          <DiamondIcon size={40} className="chat-empty-state__icon" />
          <h3>Welcome to Stellarity</h3>
          <p>Select a channel to begin transmission</p>
        </div>
      </div>
    )
  }

  const currentChannel = channels.find((c) => c.id === voiceChannelId)
  const channelName = currentChannel?.name || 'Voice Channel'

  const toggleMute = () => voiceManager.setMuted(!selfMute)
  const toggleDeaf = () => voiceManager.setDeafened(!selfDeaf)
  const handleDisconnect = () => voiceManager.leaveChannel()

  return (
    <div className="chat voice-active">
      {/* Header */}
      <div className="voice-active__header">
        <div className="voice-active__channel">
          <WaveformIcon size={18} className="voice-active__channel-icon" />
          <h2 className="voice-active__channel-name">{channelName}</h2>
        </div>
        <div className="voice-active__status">
          <SignalIcon size={14} className="voice-active__signal" />
          <span className="voice-active__status-label">Voice Connected</span>
          <span className="voice-active__user-count">{channelUsers.length} {channelUsers.length === 1 ? 'member' : 'members'}</span>
        </div>
      </div>

      {/* Member cards grid */}
      <div className="voice-active__members">
        {channelUsers.map((u) => {
          const isLocal = u.userId === user?.id
          const speaking = isLocal ? isSpeaking : u.speaking
          const quality = connectionQualities[u.userId]

          return (
            <div
              key={u.userId}
              className={`voice-member ${speaking ? 'voice-member--speaking' : ''} ${isLocal ? 'voice-member--self' : ''}`}
              onClick={() => openProfile(u.userId)}
              role="button"
              tabIndex={0}
            >
              {/* Avatar */}
              <div className="voice-member__avatar">
                <span>{(u.displayName || u.username)[0].toUpperCase()}</span>
                {speaking && <div className="voice-member__speak-ring" />}
              </div>

              {/* Info */}
              <div className="voice-member__info">
                <span className="voice-member__name">
                  {u.displayName || u.username}
                  {isLocal && <span className="voice-member__you">(You)</span>}
                </span>
                <div className="voice-member__state">
                  {u.selfMute && (
                    <span className="voice-member__badge voice-member__badge--muted">
                      <MicOffIcon size={12} /> Muted
                    </span>
                  )}
                  {u.selfDeaf && (
                    <span className="voice-member__badge voice-member__badge--deaf">
                      <HeadphonesOffIcon size={12} /> Deafened
                    </span>
                  )}
                  {!u.selfMute && !u.selfDeaf && speaking && (
                    <span className="voice-member__badge voice-member__badge--speaking">
                      <SignalIcon size={12} /> Speaking
                    </span>
                  )}
                  {!u.selfMute && !u.selfDeaf && !speaking && (
                    <span className="voice-member__badge voice-member__badge--idle">
                      Connected
                    </span>
                  )}
                </div>
              </div>

              {/* Quality indicator */}
              {quality !== undefined && (
                <div className={`voice-member__quality voice-member__quality--${quality >= 80 ? 'good' : quality >= 50 ? 'fair' : 'poor'}`}>
                  <SignalIcon size={12} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Floating controls */}
      <div className="voice-active__controls">
        <button
          className={`voice__ctrl ${selfMute ? 'voice__ctrl--active' : ''}`}
          onClick={toggleMute}
          data-tooltip={selfMute ? 'Unmute' : 'Mute'}
        >
          {selfMute ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
        </button>
        <button
          className={`voice__ctrl ${selfDeaf ? 'voice__ctrl--active' : ''}`}
          onClick={toggleDeaf}
          data-tooltip={selfDeaf ? 'Undeafen' : 'Deafen'}
        >
          {selfDeaf ? <HeadphonesOffIcon size={18} /> : <HeadphonesIcon size={18} />}
        </button>
        <button
          className="voice__ctrl voice__ctrl--disconnect"
          onClick={handleDisconnect}
          data-tooltip="Disconnect"
        >
          <PhoneOffIcon size={18} />
        </button>
      </div>
    </div>
  )
}

/* ── ChatArea ─────────────────────────────────────────── */
export const ChatArea: React.FC = () => {
  const { currentChannelId, channels } = useServerStore()
  const { messages, loading, hasMore, typingUsers, setMessages, setLoading, setHasMore } = useMessageStore()
  const { user } = useAuthStore()
  const { toggleMemberList } = useUIStore()

  const [inputValue, setInputValue] = useState('')
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [showPinnedPanel, setShowPinnedPanel] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([])
  const [pinnedLoading, setPinnedLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const currentChannel = channels.find((c) => c.id === currentChannelId)
  const channelMessages = currentChannelId ? messages[currentChannelId] || [] : []
  const channelTyping = currentChannelId ? typingUsers[currentChannelId] || [] : []

  // Load messages on channel change
  useEffect(() => {
    if (currentChannelId && !messages[currentChannelId]) loadMessages()
  }, [currentChannelId])

  // Auto-scroll to bottom on new messages (only if already near bottom)
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight
    }
  }, [channelMessages.length])

  const getInstanceConn = () => {
    const instanceId = useServerStore.getState().currentInstanceId
    return instanceId ? instanceManager.getInstance(instanceId) : undefined
  }

  const loadMessages = async () => {
    if (!currentChannelId) return
    const conn = getInstanceConn()
    if (!conn) return
    setLoading(true)
    try {
      const response = await conn.api.messages.get(currentChannelId, { limit: 50 })
      setMessages(currentChannelId, response)
      setHasMore(currentChannelId, response.length === 50)
    } catch (err) {
      console.error('Failed to load messages:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMoreMessages = async () => {
    if (!currentChannelId || loading || !hasMore[currentChannelId]) return
    const first = channelMessages[0]
    if (!first) return
    setLoading(true)
    try {
      const conn = getInstanceConn()
      if (!conn) return
      const response = await conn.api.messages.get(currentChannelId, { limit: 50, before: first.id })
      if (response.length > 0) useMessageStore.getState().prependMessages(currentChannelId, response)
      setHasMore(currentChannelId, response.length === 50)
    } catch (err) {
      console.error('Failed to load more messages:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0 && hasMore[currentChannelId!]) loadMoreMessages()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    if (currentChannelId) {
      const conn = getInstanceConn()
      conn?.socket.startTyping(currentChannelId)
      if (typingTimeout) clearTimeout(typingTimeout)
      const timeout = setTimeout(() => { if (currentChannelId) conn?.socket.stopTyping(currentChannelId) }, 2000)
      setTypingTimeout(timeout)
    }
  }

  const handleSend = async () => {
    if (!inputValue.trim() || !currentChannelId) return
    const content = inputValue.trim()
    setInputValue('')

    const conn = getInstanceConn()
    if (!conn) return

    // Clear typing indicator
    if (typingTimeout) clearTimeout(typingTimeout)
    conn.socket.stopTyping(currentChannelId)

    try {
      // Send via REST for immediate, reliable delivery
      const message = await conn.api.messages.send(currentChannelId, { content })
      // Add to store immediately — socket broadcast will be deduped by addMessage
      useMessageStore.getState().addMessage(currentChannelId, {
        ...message,
        author: message.author || {
          id: user?.id || '',
          username: user?.username || 'Unknown',
          displayName: user?.displayName,
          avatarUrl: user?.avatarUrl,
        },
      })
    } catch (err) {
      console.error('Failed to send message:', err)
      // Restore input content on failure so the user doesn't lose their message
      setInputValue(content)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleEdit = (id: string, content: string) => { const conn = getInstanceConn(); conn?.socket.editMessage(id, content) }
  const handleDelete = (id: string) => { if (currentChannelId) { const conn = getInstanceConn(); conn?.socket.deleteMessage(id, currentChannelId) } }

  const loadPinnedMessages = async () => {
    if (!currentChannelId) return
    const conn = getInstanceConn()
    if (!conn) return
    setPinnedLoading(true)
    try {
      const pinned = await conn.api.messages.getPinned(currentChannelId)
      setPinnedMessages(pinned)
    } catch (err) {
      console.error('Failed to load pinned messages:', err)
    } finally {
      setPinnedLoading(false)
    }
  }

  const togglePinnedPanel = () => {
    const next = !showPinnedPanel
    setShowPinnedPanel(next)
    if (next) loadPinnedMessages()
  }

  const handlePin = async (messageId: string) => {
    if (!currentChannelId) return
    const conn = getInstanceConn()
    if (!conn) return
    try {
      await conn.api.messages.pin(currentChannelId, messageId)
      // Update pinned state in the message store
      const existing = useMessageStore.getState().messages[currentChannelId] || []
      const msg = existing.find((m) => m.id === messageId)
      if (msg) useMessageStore.getState().updateMessage(currentChannelId, { ...msg, pinned: true })
      // Refresh pinned panel if open
      if (showPinnedPanel) loadPinnedMessages()
    } catch (err) {
      console.error('Failed to pin message:', err)
    }
  }

  const handleUnpin = async (messageId: string) => {
    if (!currentChannelId) return
    const conn = getInstanceConn()
    if (!conn) return
    try {
      await conn.api.messages.unpin(currentChannelId, messageId)
      const existing = useMessageStore.getState().messages[currentChannelId] || []
      const msg = existing.find((m) => m.id === messageId)
      if (msg) useMessageStore.getState().updateMessage(currentChannelId, { ...msg, pinned: false })
      if (showPinnedPanel) loadPinnedMessages()
    } catch (err) {
      console.error('Failed to unpin message:', err)
    }
  }

  /* ── No channel selected ─────────────────────────── */
  if (!currentChannel) {
    return <ChatEmptyOrVoice />
  }

  /* ── Voice channel ───────────────────────────────── */
  if (currentChannel.type === 'voice') {
    return <VoiceChannel channelId={currentChannel.id} channelName={currentChannel.name} />
  }

  /* ── Text channel ────────────────────────────────── */
  return (
    <div className="chat">
      {/* Channel header bar */}
      <div className="chat__header">
        <div className="chat__channel-info">
          <HashIcon size={14} className="chat__hash" />
          <span className="chat__channel-name">{currentChannel.name}</span>
          {currentChannel.description && (
            <>
              <span className="chat__divider">|</span>
              <span className="chat__channel-desc">{currentChannel.description}</span>
            </>
          )}
        </div>
        <div className="chat__header-actions">
          <button className={`btn btn--icon ${showPinnedPanel ? 'btn--active' : ''}`} data-tooltip="Pinned" onClick={togglePinnedPanel}><PinIcon size={16} /></button>
          <button className="btn btn--icon" data-tooltip="Members" onClick={toggleMemberList}><UsersIcon size={16} /></button>
          <div className="chat__search">
            <SearchIcon size={14} className="chat__search-icon" />
            <input type="text" placeholder="Search..." className="chat__search-input" />
          </div>
        </div>
      </div>

      {/* Pinned messages modal */}
      {showPinnedPanel && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPinnedPanel(false) }}>
          <div className="modal pinned-modal">
            <div className="modal__header">
              <div className="pinned-modal__title">
                <PinIcon size={14} />
                <span>Pinned Messages</span>
              </div>
              <button className="btn btn--icon" onClick={() => setShowPinnedPanel(false)}>
                &times;
              </button>
            </div>
            <div className="pinned-modal__list">
              {pinnedLoading && (
                <div className="pinned-modal__empty">
                  <p>Loading...</p>
                </div>
              )}
              {!pinnedLoading && pinnedMessages.length === 0 && (
                <div className="pinned-modal__empty">
                  <PinIcon size={24} />
                  <p>No pinned messages yet</p>
                </div>
              )}
              {!pinnedLoading && pinnedMessages.map((msg) => (
                <div key={msg.id} className="pinned-modal__msg">
                  <div className="pinned-modal__msg-header">
                    <span className="msg__author">{msg.author?.displayName || msg.author?.username || 'Unknown'}</span>
                    <span className="msg__time">{formatTime(msg.createdAt)}</span>
                  </div>
                  <div className="msg__text">{msg.content}</div>
                  <button
                    className="btn btn--ghost btn--sm pinned-modal__unpin"
                    onClick={() => handleUnpin(msg.id)}
                  >
                    Unpin
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Messages viewport */}
      <div className="chat__messages" ref={messagesContainerRef} onScroll={handleScroll}>
        {loading && channelMessages.length === 0 && (
          <div className="chat__loading">
            <DiamondIcon size={24} className="chat__loading-icon" />
            <p>Loading transmissions...</p>
          </div>
        )}

        {!loading && channelMessages.length === 0 && (
          <div className="chat__welcome">
            <HashIcon size={36} className="chat__welcome-icon" />
            <h2>Welcome to #{currentChannel.name}</h2>
            <p>This is the beginning of the #{currentChannel.name} channel.</p>
          </div>
        )}

        {hasMore[currentChannelId!] && channelMessages.length > 0 && (
          <button className="btn btn--ghost chat__load-more" onClick={loadMoreMessages} disabled={loading}>
            {loading ? 'Loading...' : 'Load older messages'}
          </button>
        )}

        {channelMessages.map((msg, idx) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isOwn={msg.userId === user?.id}
            isGrouped={shouldGroup(channelMessages[idx - 1], msg)}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onPin={handlePin}
            onUnpin={handleUnpin}
            onClickAuthor={(userId) => useUIStore.getState().openProfile(userId)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {channelTyping.length > 0 && (
        <div className="chat__typing">
          <span className="chat__typing-dots"><span /><span /><span /></span>
          <span className="chat__typing-text">
            {channelTyping.map((u) => u.username).join(', ')}{' '}
            {channelTyping.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {/* Input bar */}
      <div className="chat__input-container">
        <div className="chat__input-wrapper">
          <button className="btn btn--icon chat__input-action"><PlusIcon size={16} /></button>
          <input
            type="text"
            className="chat__input"
            placeholder={`Message #${currentChannel.name}`}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          <button className="btn btn--icon chat__input-send" onClick={handleSend} data-tooltip="Send">
            <SendIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
