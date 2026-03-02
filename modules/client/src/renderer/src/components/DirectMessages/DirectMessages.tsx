import React, { useEffect, useState, useRef, useCallback } from 'react'
import { centralApi } from '../../utils/centralApi'
import { centralSocket } from '../../utils/centralSocket'
import { useDMStore } from '../../stores/dmStore'
import { useAuthStore } from '../../stores/authStore'
import { MessageIcon, SendIcon } from '../Icons'
import './DirectMessages.css'

interface DMConversation {
  id: string
  participants: Array<{
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status: string
    statusMessage: string | null
  }>
  lastMessageAt: string | null
  unreadCount: number
}

interface DMMessage {
  id: string
  senderId: string
  senderUsername: string
  content: string
  timestamp: string
}

export const DirectMessages: React.FC = () => {
  const { user } = useAuthStore()
  const { conversations, pendingMessages, pendingCount, setConversations, setPendingMessages } = useDMStore()
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DMMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [acknowledging, setAcknowledging] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load conversations on mount
  useEffect(() => {
    loadConversations()
    loadPending()
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Listen for incoming DM signals
  useEffect(() => {
    const cleanup = centralSocket.onDMPending(() => {
      loadPending()
    })
    return cleanup
  }, [])

  const loadConversations = async () => {
    try {
      const result = await centralApi.dm.getConversations()
      setConversations(result.conversations || [])
    } catch (e) {
      console.error('Failed to load DM conversations:', e)
    }
  }

  const loadPending = async () => {
    try {
      const result = await centralApi.dm.getPending()
      setPendingMessages(result.messages || [])
    } catch (e) {
      console.error('Failed to load pending DMs:', e)
    }
  }

  const handleAcknowledge = async () => {
    if (pendingMessages.length === 0) return
    setAcknowledging(true)
    try {
      const ids = pendingMessages.map((m) => m.id)
      await centralApi.dm.acknowledge(ids)

      // Add acknowledged messages to local message list
      const newMessages: DMMessage[] = pendingMessages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderUsername: m.senderUsername,
        content: m.contentEncrypted, // Would be decrypted in production
        timestamp: m.createdAt,
      }))
      setMessages((prev) => [...prev, ...newMessages])
      setPendingMessages([])
      loadConversations()
    } catch (e) {
      console.error('Failed to acknowledge DMs:', e)
    } finally {
      setAcknowledging(false)
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !activeConversationId || sending) return

    const activeConvo = conversations.find((c) => c.id === activeConversationId)
    if (!activeConvo) return

    const recipient = activeConvo.participants.find((p) => p.id !== user?.id)
    if (!recipient) return

    setSending(true)
    try {
      // Check if peer is online for P2P delivery
      centralSocket.checkUserOnline(recipient.id)

      // Fall back to buffered delivery via central
      await centralApi.dm.send({
        recipientId: recipient.id,
        content: input.trim(),
      })

      // Add to local messages
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          senderId: user?.id || '',
          senderUsername: user?.username || '',
          content: input.trim(),
          timestamp: new Date().toISOString(),
        },
      ])
      setInput('')
    } catch (e) {
      console.error('Failed to send DM:', e)
    } finally {
      setSending(false)
    }
  }

  const getOtherParticipant = (convo: DMConversation) => {
    return convo.participants.find((p) => p.id !== user?.id) || convo.participants[0]
  }

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString()
  }

  const activeConvo = conversations.find((c) => c.id === activeConversationId)
  const activeOther = activeConvo ? getOtherParticipant(activeConvo) : null

  return (
    <div className="dm-panel">
      <div className="dm-layout">
        {/* Sidebar - Conversation List */}
        <div className="dm-sidebar">
          <div className="dm-header">
            <span className="dm-header__title">
              <MessageIcon size={14} /> Direct Messages
              {pendingCount > 0 && (
                <span className="dm-header__badge">{pendingCount}</span>
              )}
            </span>
          </div>

          {/* Pending DMs banner */}
          {pendingCount > 0 && (
            <div className="dm-pending" onClick={handleAcknowledge}>
              <span className="dm-pending__text">
                {pendingCount} buffered message{pendingCount > 1 ? 's' : ''}
              </span>
              <button
                className="dm-pending__action"
                disabled={acknowledging}
              >
                {acknowledging ? 'Retrieving...' : 'Retrieve'}
              </button>
            </div>
          )}

          <div className="dm-conversations">
            {conversations.length === 0 ? (
              <div className="dm-empty">
                <MessageIcon size={32} className="dm-empty__icon" />
                <div className="dm-empty__text">No conversations</div>
                <div className="dm-empty__sub">
                  Send a message to start a conversation
                </div>
              </div>
            ) : (
              conversations.map((convo) => {
                const other = getOtherParticipant(convo)
                return (
                  <div
                    key={convo.id}
                    className={`dm-conversation ${activeConversationId === convo.id ? 'active' : ''}`}
                    onClick={() => setActiveConversationId(convo.id)}
                  >
                    <div className="dm-conversation__avatar">
                      {other.avatarUrl ? (
                        <img src={other.avatarUrl} alt="" />
                      ) : (
                        (other.displayName || other.username).charAt(0).toUpperCase()
                      )}
                      <div
                        className={`dm-conversation__status dm-conversation__status--${other.status || 'offline'}`}
                      />
                    </div>
                    <div className="dm-conversation__info">
                      <div className="dm-conversation__name">
                        {other.displayName || other.username}
                      </div>
                      {other.statusMessage && (
                        <div className="dm-conversation__preview">{other.statusMessage}</div>
                      )}
                    </div>
                    <span className="dm-conversation__time">
                      {formatTime(convo.lastMessageAt)}
                    </span>
                    {convo.unreadCount > 0 && <div className="dm-conversation__unread" />}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Main - Chat Area */}
        <div className="dm-main">
          {!activeConvo ? (
            <div className="dm-chat__empty">
              <MessageIcon size={40} className="dm-empty__icon" />
              <div className="dm-chat__empty-title">Select a conversation</div>
              <div className="dm-chat__empty-sub">
                Choose a conversation from the sidebar or start a new one
              </div>
            </div>
          ) : (
            <div className="dm-chat">
              {/* Chat header */}
              <div className="dm-header">
                <span className="dm-header__title">
                  {activeOther?.displayName || activeOther?.username}
                </span>
              </div>

              {/* Messages */}
              <div className="dm-chat__messages">
                {messages.length === 0 ? (
                  <div className="dm-chat__empty">
                    <div className="dm-chat__empty-title">No messages yet</div>
                    <div className="dm-chat__empty-sub">
                      Start the conversation with {activeOther?.displayName || activeOther?.username}
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div className="dm-message" key={msg.id}>
                      <div className="dm-message__avatar">
                        {msg.senderUsername.charAt(0).toUpperCase()}
                      </div>
                      <div className="dm-message__content">
                        <div className="dm-message__header">
                          <span className="dm-message__sender">{msg.senderUsername}</span>
                          <span className="dm-message__time">{formatTime(msg.timestamp)}</span>
                        </div>
                        <div className="dm-message__text">{msg.content}</div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form className="dm-chat__input-row" onSubmit={handleSend}>
                <input
                  className="dm-chat__input"
                  type="text"
                  placeholder={`Message ${activeOther?.displayName || activeOther?.username}...`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button
                  className="dm-chat__send"
                  type="submit"
                  disabled={!input.trim() || sending}
                >
                  <SendIcon size={14} />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
