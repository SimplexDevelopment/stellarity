import React, { useEffect, useState, useCallback } from 'react'
import { centralApi } from '../../utils/centralApi'
import { centralSocket } from '../../utils/centralSocket'
import { useConnectionStore } from '../../stores/connectionStore'
import { useAuthStore } from '../../stores/authStore'
import { FriendsIcon, SendIcon } from '../Icons'
import './Connections.css'

type Tab = 'all' | 'pending' | 'blocked' | 'add'

const TAB_LABELS: Record<Tab, string> = {
  all: 'All',
  pending: 'Pending',
  blocked: 'Blocked',
  add: 'Add Connection',
}

export const Connections: React.FC = () => {
  const { user } = useAuthStore()
  const {
    connections,
    incomingRequests,
    outgoingRequests,
    blockedUsers,
    activeTab,
    isLoading,
    error,
    setConnections,
    setIncomingRequests,
    setOutgoingRequests,
    setBlockedUsers,
    addConnection,
    removeConnection,
    addIncomingRequest,
    removeIncomingRequest,
    removeOutgoingRequest,
    setActiveTab,
    setLoading,
    setError,
  } = useConnectionStore()

  const [usernameInput, setUsernameInput] = useState('')
  const [requestMessage, setRequestMessage] = useState('')
  const [sendingRequest, setSendingRequest] = useState(false)
  const [actionInProgress, setActionInProgress] = useState<Set<string>>(new Set())
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // ── Data Loading ─────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [friendsRes, inRes, outRes, blockedRes] = await Promise.all([
        centralApi.connections.list(),
        centralApi.connections.getIncomingRequests(),
        centralApi.connections.getOutgoingRequests(),
        centralApi.connections.getBlocked(),
      ])
      setConnections(friendsRes.friends || [])
      setIncomingRequests(inRes.requests || [])
      setOutgoingRequests(outRes.requests || [])
      setBlockedUsers(blockedRes.blocked || [])
    } catch (e: any) {
      setError(e.message || 'Failed to load connections')
      console.error('Failed to load connections:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // ── Real-time Socket Events ──────────────────────────────────────

  useEffect(() => {
    const cleanupRequest = centralSocket.onConnectionRequest((data) => {
      addIncomingRequest(data.request)
    })
    const cleanupAccepted = centralSocket.onConnectionAccepted((data) => {
      addConnection(data.friendship)
      // Remove from outgoing requests if present
      removeOutgoingRequest(data.friendship.id)
    })
    const cleanupRemoved = centralSocket.onConnectionRemoved((data) => {
      removeConnection(data.friendshipId)
    })
    return () => {
      cleanupRequest()
      cleanupAccepted()
      cleanupRemoved()
    }
  }, [])

  // ── Actions ──────────────────────────────────────────────────────

  const markAction = (id: string, active: boolean) => {
    setActionInProgress((prev) => {
      const next = new Set(prev)
      active ? next.add(id) : next.delete(id)
      return next
    })
  }

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    const username = usernameInput.trim()
    if (!username || sendingRequest) return

    setSendingRequest(true)
    setError(null)
    setSuccessMessage(null)
    try {
      await centralApi.connections.sendRequest(username, requestMessage.trim() || undefined)
      setSuccessMessage(`Connection request sent to ${username}`)
      setUsernameInput('')
      setRequestMessage('')
      // Reload outgoing requests
      const outRes = await centralApi.connections.getOutgoingRequests()
      setOutgoingRequests(outRes.requests || [])
    } catch (e: any) {
      setError(e.message || 'Failed to send connection request')
    } finally {
      setSendingRequest(false)
    }
  }

  const handleAccept = async (friendshipId: string) => {
    markAction(friendshipId, true)
    try {
      const res = await centralApi.connections.accept(friendshipId)
      removeIncomingRequest(friendshipId)
      addConnection(res.friendship)
    } catch (e: any) {
      setError(e.message || 'Failed to accept request')
    } finally {
      markAction(friendshipId, false)
    }
  }

  const handleReject = async (friendshipId: string) => {
    markAction(friendshipId, true)
    try {
      await centralApi.connections.reject(friendshipId)
      removeIncomingRequest(friendshipId)
    } catch (e: any) {
      setError(e.message || 'Failed to reject request')
    } finally {
      markAction(friendshipId, false)
    }
  }

  const handleRemove = async (friendshipId: string) => {
    markAction(friendshipId, true)
    try {
      await centralApi.connections.remove(friendshipId)
      removeConnection(friendshipId)
    } catch (e: any) {
      setError(e.message || 'Failed to remove connection')
    } finally {
      markAction(friendshipId, false)
    }
  }

  const handleCancelOutgoing = async (friendshipId: string) => {
    markAction(friendshipId, true)
    try {
      await centralApi.connections.reject(friendshipId)
      removeOutgoingRequest(friendshipId)
    } catch (e: any) {
      setError(e.message || 'Failed to cancel request')
    } finally {
      markAction(friendshipId, false)
    }
  }

  const handleBlock = async (userId: string) => {
    markAction(userId, true)
    try {
      await centralApi.connections.block(userId)
      // Reload everything since a block may remove a connection
      await loadAll()
    } catch (e: any) {
      setError(e.message || 'Failed to block user')
    } finally {
      markAction(userId, false)
    }
  }

  const handleUnblock = async (userId: string) => {
    markAction(userId, true)
    try {
      await centralApi.connections.unblock(userId)
      setBlockedUsers(blockedUsers.filter((u) => u.id !== userId))
    } catch (e: any) {
      setError(e.message || 'Failed to unblock user')
    } finally {
      markAction(userId, false)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString()
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'online': return 'var(--color-accent-secondary, #4caf50)'
      case 'idle': return '#ffa726'
      case 'dnd': return '#ef5350'
      default: return '#555'
    }
  }

  const pendingCount = incomingRequests.length + outgoingRequests.length

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="conn-panel">
      <div className="conn-header">
        <span className="conn-header__title">
          <FriendsIcon size={16} /> Connections
        </span>
      </div>

      {/* Tabs */}
      <div className="conn-tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`conn-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab); setError(null); setSuccessMessage(null) }}
          >
            {TAB_LABELS[tab]}
            {tab === 'all' && connections.length > 0 && (
              <span className="conn-tab__count">{connections.length}</span>
            )}
            {tab === 'pending' && pendingCount > 0 && (
              <span className="conn-tab__count conn-tab__count--alert">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Error / Success banners */}
      {error && (
        <div className="conn-banner conn-banner--error">
          {error}
          <button className="conn-banner__dismiss" onClick={() => setError(null)}>×</button>
        </div>
      )}
      {successMessage && (
        <div className="conn-banner conn-banner--success">
          {successMessage}
          <button className="conn-banner__dismiss" onClick={() => setSuccessMessage(null)}>×</button>
        </div>
      )}

      {/* Content */}
      <div className="conn-content">
        {isLoading && connections.length === 0 ? (
          <div className="conn-empty">
            <div className="conn-empty__text">Loading connections...</div>
          </div>
        ) : (
          <>
            {/* ── All Connections ──────────────────────────── */}
            {activeTab === 'all' && (
              connections.length === 0 ? (
                <div className="conn-empty">
                  <FriendsIcon size={40} className="conn-empty__icon" />
                  <div className="conn-empty__title">No connections yet</div>
                  <div className="conn-empty__sub">
                    Add a connection by username to get started
                  </div>
                  <button className="conn-empty__action" onClick={() => setActiveTab('add')}>
                    Add Connection
                  </button>
                </div>
              ) : (
                <div className="conn-list">
                  {connections.map((conn) => (
                    <div className="conn-card" key={conn.id}>
                      <div className="conn-card__avatar">
                        {conn.friend.avatarUrl ? (
                          <img src={conn.friend.avatarUrl} alt="" />
                        ) : (
                          (conn.friend.displayName || conn.friend.username).charAt(0).toUpperCase()
                        )}
                        <div
                          className="conn-card__status"
                          style={{ background: statusColor(conn.friend.status) }}
                        />
                      </div>
                      <div className="conn-card__info">
                        <div className="conn-card__name">
                          {conn.friend.displayName || conn.friend.username}
                        </div>
                        <div className="conn-card__meta">
                          @{conn.friend.username}
                          {conn.friend.statusMessage && (
                            <> · {conn.friend.statusMessage}</>
                          )}
                        </div>
                      </div>
                      <div className="conn-card__actions">
                        <button
                          className="conn-btn conn-btn--danger"
                          onClick={() => handleRemove(conn.id)}
                          disabled={actionInProgress.has(conn.id)}
                          title="Remove connection"
                        >
                          Remove
                        </button>
                        <button
                          className="conn-btn conn-btn--muted"
                          onClick={() => handleBlock(conn.friend.id)}
                          disabled={actionInProgress.has(conn.friend.id)}
                          title="Block user"
                        >
                          Block
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── Pending Requests ────────────────────────── */}
            {activeTab === 'pending' && (
              <div className="conn-pending">
                {incomingRequests.length > 0 && (
                  <div className="conn-section">
                    <div className="conn-section__label">
                      Incoming — {incomingRequests.length}
                    </div>
                    {incomingRequests.map((req) => (
                      <div className="conn-card" key={req.id}>
                        <div className="conn-card__avatar">
                          {req.sender.avatarUrl ? (
                            <img src={req.sender.avatarUrl} alt="" />
                          ) : (
                            (req.sender.displayName || req.sender.username).charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="conn-card__info">
                          <div className="conn-card__name">
                            {req.sender.displayName || req.sender.username}
                          </div>
                          <div className="conn-card__meta">
                            @{req.sender.username} · {formatTime(req.createdAt)}
                            {req.message && <div className="conn-card__message">"{req.message}"</div>}
                          </div>
                        </div>
                        <div className="conn-card__actions">
                          <button
                            className="conn-btn conn-btn--accept"
                            onClick={() => handleAccept(req.id)}
                            disabled={actionInProgress.has(req.id)}
                          >
                            Accept
                          </button>
                          <button
                            className="conn-btn conn-btn--danger"
                            onClick={() => handleReject(req.id)}
                            disabled={actionInProgress.has(req.id)}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {outgoingRequests.length > 0 && (
                  <div className="conn-section">
                    <div className="conn-section__label">
                      Outgoing — {outgoingRequests.length}
                    </div>
                    {outgoingRequests.map((req) => (
                      <div className="conn-card" key={req.id}>
                        <div className="conn-card__avatar">
                          {req.sender.avatarUrl ? (
                            <img src={req.sender.avatarUrl} alt="" />
                          ) : (
                            (req.sender.displayName || req.sender.username).charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="conn-card__info">
                          <div className="conn-card__name">
                            {req.sender.displayName || req.sender.username}
                          </div>
                          <div className="conn-card__meta">
                            Sent {formatTime(req.createdAt)}
                          </div>
                        </div>
                        <div className="conn-card__actions">
                          <button
                            className="conn-btn conn-btn--muted"
                            onClick={() => handleCancelOutgoing(req.id)}
                            disabled={actionInProgress.has(req.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
                  <div className="conn-empty">
                    <div className="conn-empty__title">No pending requests</div>
                    <div className="conn-empty__sub">
                      You're all caught up
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Blocked Users ───────────────────────────── */}
            {activeTab === 'blocked' && (
              blockedUsers.length === 0 ? (
                <div className="conn-empty">
                  <div className="conn-empty__title">No blocked users</div>
                  <div className="conn-empty__sub">
                    Users you block won't be able to send you requests
                  </div>
                </div>
              ) : (
                <div className="conn-list">
                  {blockedUsers.map((user) => (
                    <div className="conn-card" key={user.id}>
                      <div className="conn-card__avatar">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt="" />
                        ) : (
                          (user.displayName || user.username).charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="conn-card__info">
                        <div className="conn-card__name">
                          {user.displayName || user.username}
                        </div>
                        <div className="conn-card__meta">@{user.username}</div>
                      </div>
                      <div className="conn-card__actions">
                        <button
                          className="conn-btn conn-btn--accept"
                          onClick={() => handleUnblock(user.id)}
                          disabled={actionInProgress.has(user.id)}
                        >
                          Unblock
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── Add Connection ──────────────────────────── */}
            {activeTab === 'add' && (
              <div className="conn-add">
                <div className="conn-add__heading">Add Connection</div>
                <div className="conn-add__sub">
                  Enter a username to send a connection request
                </div>
                <form className="conn-add__form" onSubmit={handleSendRequest}>
                  <div className="conn-add__field">
                    <label className="conn-add__label">Username</label>
                    <input
                      className="conn-add__input"
                      type="text"
                      placeholder="username"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="conn-add__field">
                    <label className="conn-add__label">Message (optional)</label>
                    <input
                      className="conn-add__input"
                      type="text"
                      placeholder="Hey, let's connect!"
                      value={requestMessage}
                      onChange={(e) => setRequestMessage(e.target.value)}
                    />
                  </div>
                  <button
                    className="conn-btn conn-btn--primary"
                    type="submit"
                    disabled={!usernameInput.trim() || sendingRequest}
                  >
                    {sendingRequest ? 'Sending...' : 'Send Request'}
                    {!sendingRequest && <SendIcon size={14} />}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
