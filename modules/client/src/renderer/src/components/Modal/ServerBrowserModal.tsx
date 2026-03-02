import React, { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { useInstanceStore } from '../../stores/instanceStore'
import { useServerStore } from '../../stores/serverStore'
import { instanceManager } from '../../utils/instanceManager'
import {
  ServerIcon,
  PlusIcon,
  UsersIcon,
  CheckIcon,
  ArrowRightIcon,
  GlobeIcon,
  LockIcon,
  KeyIcon,
} from '../Icons'

interface BrowsableServer {
  id: string
  name: string
  description: string | null
  iconUrl: string | null
  memberCount: number
  isPublic: boolean
  hasPassword: boolean
  inviteCode: string | null
  isMember: boolean
}

interface ServerBrowserModalProps {
  isOpen: boolean
  instanceId: string | null
  onClose: () => void
  onOpenCreateServer: () => void
}

export const ServerBrowserModal: React.FC<ServerBrowserModalProps> = ({
  isOpen,
  instanceId,
  onClose,
  onOpenCreateServer,
}) => {
  const [availableServers, setAvailableServers] = useState<BrowsableServer[]>([])
  const [loading, setLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set())
  const [passwordPromptId, setPasswordPromptId] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)

  const { savedInstances } = useInstanceStore()
  const { addServer } = useServerStore()

  const instance = savedInstances.find(i => i.id === instanceId)
  const instanceName = instance?.name || 'Instance'

  useEffect(() => {
    if (!isOpen || !instanceId) return
    setLoading(true)
    setJoinedIds(new Set())
    setPasswordPromptId(null)
    setPassword('')
    setJoinError(null)

    const conn = instanceManager.getInstance(instanceId)
    if (!conn) {
      setLoading(false)
      return
    }

    conn.api.servers.browse()
      .then((result) => {
        setAvailableServers(result.servers || [])
      })
      .catch((e) => {
        console.error('Failed to browse servers:', e)
        setAvailableServers([])
      })
      .finally(() => setLoading(false))
  }, [isOpen, instanceId])

  const handleJoinPublic = async (server: BrowsableServer, pwd?: string) => {
    if (!instanceId) return
    const conn = instanceManager.getInstance(instanceId)
    if (!conn) return

    setJoiningId(server.id)
    setJoinError(null)
    try {
      const result = await conn.api.servers.joinPublic(server.id, pwd)
      addServer({
        ...result.server,
        instanceId,
        instanceName,
      })
      setJoinedIds(prev => new Set(prev).add(server.id))
      setPasswordPromptId(null)
      setPassword('')
    } catch (e: any) {
      const msg = e?.message || 'Failed to join server'
      if (msg.includes('password')) {
        setJoinError('Incorrect password')
      } else {
        setJoinError(msg)
      }
      console.error('Failed to join server:', e)
    } finally {
      setJoiningId(null)
    }
  }

  const handleJoinClick = (server: BrowsableServer) => {
    if (server.hasPassword) {
      setPasswordPromptId(server.id)
      setPassword('')
      setJoinError(null)
    } else {
      handleJoinPublic(server)
    }
  }

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const server = availableServers.find(s => s.id === passwordPromptId)
    if (server) handleJoinPublic(server, password)
  }

  const handleDone = () => {
    onClose()
  }

  const handleCreateNew = () => {
    onClose()
    onOpenCreateServer()
  }

  // Split into joined + available sections using backend isMember flag
  const joinedServers = availableServers.filter(
    s => s.isMember || joinedIds.has(s.id)
  )
  const serversToShow = availableServers.filter(
    s => !s.isMember && !joinedIds.has(s.id)
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="BROWSE SERVERS">
      <div className="server-browser">
        <p className="server-browser__subtitle">
          Servers available on <strong>{instanceName}</strong>
        </p>

        {loading ? (
          <div className="server-browser__loading">
            <div className="add-instance-status__spinner" />
            <p>Loading servers...</p>
          </div>
        ) : (
          <>
            {/* Already-joined servers */}
            {joinedServers.length > 0 && (
              <div className="server-browser__section">
                <span className="server-browser__section-label">
                  JOINED ({joinedServers.length})
                </span>
                <div className="server-browser__grid">
                  {joinedServers.map(s => (
                    <div key={s.id} className="server-browse-card server-browse-card--joined">
                      <div className="server-browse-card__icon">
                        <ServerIcon size={16} />
                      </div>
                      <div className="server-browse-card__info">
                        <span className="server-browse-card__name">{s.name}</span>
                        {s.description && (
                          <span className="server-browse-card__desc">{s.description}</span>
                        )}
                        <span className="server-browse-card__members">
                          <UsersIcon size={10} /> {s.memberCount}
                        </span>
                      </div>
                      <div className="server-browse-card__badge">
                        <CheckIcon size={14} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available to join */}
            {serversToShow.length > 0 && (
              <div className="server-browser__section">
                <span className="server-browser__section-label">
                  AVAILABLE ({serversToShow.length})
                </span>
                <div className="server-browser__grid">
                  {serversToShow.map(s => {
                    const isJoining = joiningId === s.id
                    const showPasswordForm = passwordPromptId === s.id
                    return (
                      <div key={s.id} className="server-browse-card">
                        <div className="server-browse-card__icon">
                          <ServerIcon size={16} />
                        </div>
                        <div className="server-browse-card__info">
                          <span className="server-browse-card__name">
                            {s.name}
                            <span className="server-browse-card__badges">
                              {s.isPublic ? (
                                <GlobeIcon size={11} className="server-browse-card__visibility" />
                              ) : (
                                <LockIcon size={11} className="server-browse-card__visibility server-browse-card__visibility--private" />
                              )}
                              {s.hasPassword && (
                                <KeyIcon size={11} className="server-browse-card__pw-icon" />
                              )}
                            </span>
                          </span>
                          {s.description && (
                            <span className="server-browse-card__desc">{s.description}</span>
                          )}
                          <span className="server-browse-card__members">
                            <UsersIcon size={10} /> {s.memberCount}
                          </span>
                        </div>
                        {showPasswordForm ? (
                          <form className="server-browse-card__pw-form" onSubmit={handlePasswordSubmit}>
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Server password"
                              autoFocus
                              className="server-browse-card__pw-input"
                            />
                            {joinError && <span className="server-browse-card__error">{joinError}</span>}
                            <div className="server-browse-card__pw-actions">
                              <button type="button" className="btn btn--ghost btn--xs" onClick={() => setPasswordPromptId(null)}>Cancel</button>
                              <button type="submit" className="btn btn--primary btn--xs" disabled={isJoining || !password}>
                                {isJoining ? '...' : 'Join'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button
                            className="btn btn--ghost btn--xs"
                            onClick={() => handleJoinClick(s)}
                            disabled={isJoining}
                          >
                            {isJoining ? 'Joining...' : 'Join'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* No servers at all */}
            {availableServers.length === 0 && (
              <div className="server-browser__empty">
                <ServerIcon size={32} className="server-browser__empty-icon" />
                <p>No servers on this instance yet.</p>
                <p className="server-browser__empty-sub">Be the first to create one!</p>
              </div>
            )}
          </>
        )}

        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={handleCreateNew}>
            <PlusIcon size={12} /> Create Server
          </button>
          <button className="btn btn--primary" onClick={handleDone}>
            <ArrowRightIcon size={12} /> Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
