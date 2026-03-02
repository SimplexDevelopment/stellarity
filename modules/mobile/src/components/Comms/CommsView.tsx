import React, { useState } from 'react'
import { useServerStore } from '../../stores/serverStore'
import { useInstanceStore } from '../../stores/instanceStore'
import { useAuthStore } from '../../stores/authStore'
import { instanceManager } from '../../utils/instanceManager'
import {
  ServerIcon,
  PlusIcon,
  ChevronIcon,
  WifiIcon,
  WifiOffIcon,
  CompassIcon,
  DiamondIcon,
  UsersIcon,
  GlobeIcon,
  LockIcon,
  KeyIcon,
  CheckIcon,
} from '../Icons'
import './CommsView.css'

interface CommsViewProps {
  onSelectServer: (serverId: string) => void
  onAddServer: () => void
}

export const CommsView: React.FC<CommsViewProps> = ({ onSelectServer, onAddServer }) => {
  const { servers } = useServerStore()
  const { savedInstances, onlineStatus } = useInstanceStore()
  const { user } = useAuthStore()
  const [browseInstanceId, setBrowseInstanceId] = useState<string | null>(null)
  const [browseServers, setBrowseServers] = useState<any[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [passwordPromptId, setPasswordPromptId] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)

  // Group servers by instance
  const serversByInstance = savedInstances.map(inst => ({
    instance: inst,
    online: onlineStatus[inst.id] === 'online',
    servers: servers.filter(s => (s as any).instanceId === inst.id),
  }))

  const handleBrowse = async (instanceId: string) => {
    if (browseInstanceId === instanceId) {
      setBrowseInstanceId(null)
      return
    }
    setBrowseInstanceId(instanceId)
    setBrowseLoading(true)
    try {
      const conn = instanceManager.getInstance(instanceId)
      if (conn) {
        const result = await conn.api.servers.browse()
        setBrowseServers(result.servers || [])
      }
    } catch (e) {
      console.error('Failed to browse:', e)
      setBrowseServers([])
    } finally {
      setBrowseLoading(false)
    }
  }

  const handleJoinPublic = async (instanceId: string, server: any, pwd?: string) => {
    const conn = instanceManager.getInstance(instanceId)
    if (!conn) return
    setJoiningId(server.id)
    setJoinError(null)
    try {
      const result = await conn.api.servers.joinPublic(server.id, pwd)
      useServerStore.getState().addServer({
        ...result.server,
        instanceId,
        instanceName: conn.name,
      })
      setPasswordPromptId(null)
      setPassword('')
      // Refresh browse list
      const updated = await conn.api.servers.browse()
      setBrowseServers(updated.servers || [])
    } catch (e: any) {
      setJoinError(e?.message?.includes('password') ? 'Incorrect password' : (e?.message || 'Failed to join'))
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="comms-view">
      {/* Header */}
      <div className="mobile-header">
        <div className="comms-user-badge">
          <div className="comms-user-avatar">
            {(user?.displayName || user?.username || 'U')[0].toUpperCase()}
          </div>
        </div>
        <span className="mobile-header__title">COMMS</span>
        <div className="mobile-header__actions">
          <button className="btn btn--icon" onClick={onAddServer}>
            <PlusIcon size={18} />
          </button>
        </div>
      </div>

      {/* Server list grouped by instance */}
      <div className="comms-list">
        {serversByInstance.length === 0 ? (
          <div className="comms-empty">
            <DiamondIcon size={36} className="comms-empty__icon" />
            <p>No instances connected</p>
            <button className="btn btn--secondary" onClick={onAddServer}>
              <PlusIcon size={12} /> Add Instance
            </button>
          </div>
        ) : (
          serversByInstance.map(({ instance, online, servers: instServers }) => (
            <div key={instance.id} className="comms-instance">
              {/* Instance header */}
              <div className="comms-instance__header">
                <div className={`comms-instance__status ${online ? 'comms-instance__status--online' : ''}`}>
                  {online ? <WifiIcon size={12} /> : <WifiOffIcon size={12} />}
                </div>
                <span className="comms-instance__name">{instance.name}</span>
                {online && (
                  <button
                    className={`comms-instance__browse ${browseInstanceId === instance.id ? 'comms-instance__browse--active' : ''}`}
                    onClick={() => handleBrowse(instance.id)}
                  >
                    <CompassIcon size={14} />
                  </button>
                )}
              </div>

              {/* Joined servers */}
              {instServers.map(server => (
                <button
                  key={server.id}
                  className="comms-server"
                  onClick={() => onSelectServer(server.id)}
                  disabled={!online}
                >
                  <div className="comms-server__icon">
                    {server.iconUrl ? (
                      <img src={server.iconUrl} alt="" />
                    ) : (
                      <span>{server.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="comms-server__info">
                    <span className="comms-server__name">{server.name}</span>
                    {server.description && (
                      <span className="comms-server__desc">{server.description}</span>
                    )}
                  </div>
                  <ChevronIcon size={14} direction="right" className="comms-server__arrow" />
                </button>
              ))}

              {/* Browse panel */}
              {browseInstanceId === instance.id && (
                <div className="comms-browse">
                  {browseLoading ? (
                    <div className="comms-browse__loading">
                      <DiamondIcon size={16} className="m-auth-spinner" />
                      <span>Loading servers...</span>
                    </div>
                  ) : browseServers.length === 0 ? (
                    <div className="comms-browse__empty">No servers available</div>
                  ) : (
                    browseServers
                      .filter((s: any) => !s.isMember)
                      .map((s: any) => (
                        <div key={s.id} className="comms-browse-card">
                          <div className="comms-browse-card__info">
                            <span className="comms-browse-card__name">
                              {s.name}
                              {s.isPublic ? (
                                <GlobeIcon size={10} className="comms-browse-card__vis" />
                              ) : (
                                <LockIcon size={10} className="comms-browse-card__vis comms-browse-card__vis--private" />
                              )}
                              {s.hasPassword && <KeyIcon size={10} className="comms-browse-card__key" />}
                            </span>
                            <span className="comms-browse-card__meta">
                              <UsersIcon size={10} /> {s.memberCount}
                            </span>
                          </div>

                          {passwordPromptId === s.id ? (
                            <form
                              className="comms-browse-card__pw"
                              onSubmit={(e) => { e.preventDefault(); handleJoinPublic(instance.id, s, password) }}
                            >
                              <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password"
                                autoFocus
                                className="comms-browse-card__pw-input"
                              />
                              {joinError && <span className="comms-browse-card__error">{joinError}</span>}
                              <div className="comms-browse-card__pw-btns">
                                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPasswordPromptId(null)}>Cancel</button>
                                <button type="submit" className="btn btn--primary btn--sm" disabled={joiningId === s.id || !password}>
                                  {joiningId === s.id ? '...' : 'Join'}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button
                              className="btn btn--primary btn--sm"
                              onClick={() => {
                                if (s.hasPassword) {
                                  setPasswordPromptId(s.id)
                                  setPassword('')
                                  setJoinError(null)
                                } else {
                                  handleJoinPublic(instance.id, s)
                                }
                              }}
                              disabled={joiningId === s.id}
                            >
                              {joiningId === s.id ? '...' : 'Join'}
                            </button>
                          )}
                        </div>
                      ))
                  )}
                </div>
              )}

              {instServers.length === 0 && browseInstanceId !== instance.id && (
                <div className="comms-instance__empty">
                  <span>No servers joined</span>
                  {online && (
                    <button className="btn btn--ghost btn--sm" onClick={() => handleBrowse(instance.id)}>
                      <CompassIcon size={12} /> Browse
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
