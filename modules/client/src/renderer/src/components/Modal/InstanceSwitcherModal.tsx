import React from 'react'
import { Modal } from './Modal'
import { useInstanceStore, InstanceOnlineStatus } from '../../stores/instanceStore'
import { useServerStore } from '../../stores/serverStore'
import { instanceManager } from '../../utils/instanceManager'
import {
  GlobeIcon,
  ServerIcon,
  TrashIcon,
  ZapIcon,
  WifiIcon,
  WifiOffIcon,
  PlusIcon,
  ChevronIcon,
  AlertCircleIcon,
} from '../Icons'

interface InstanceSwitcherModalProps {
  isOpen: boolean
  onClose: () => void
  onAddInstance: () => void
  onSelectServer: (serverId: string, instanceId: string) => void
}

export const InstanceSwitcherModal: React.FC<InstanceSwitcherModalProps> = ({
  isOpen,
  onClose,
  onAddInstance,
  onSelectServer,
}) => {
  const { savedInstances, connectedInstanceIds, activeInstanceId, onlineStatus, setActiveInstance, removeInstance } = useInstanceStore()
  const { servers, currentServerId } = useServerStore()

  const [expandedId, setExpandedId] = React.useState<string | null>(activeInstanceId)
  const [disconnecting, setDisconnecting] = React.useState<string | null>(null)

  // Check all instances on modal open
  React.useEffect(() => {
    if (isOpen) {
      instanceManager.checkAllSavedInstances()
    }
  }, [isOpen])

  const getOnlineStatus = (instanceId: string): InstanceOnlineStatus => {
    return onlineStatus[instanceId] || 'unknown'
  }

  const isOffline = (instanceId: string): boolean => {
    const status = getOnlineStatus(instanceId)
    return status === 'offline'
  }

  const handleToggle = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
    // Also activate the instance when clicking on it (if online + connected)
    if (!isOffline(id) && connectedInstanceIds.includes(id)) {
      handleActivate(id)
    }
  }

  const handleActivate = (instanceId: string) => {
    // Don't allow activating an offline instance
    if (isOffline(instanceId)) return
    setActiveInstance(instanceId)
    useServerStore.getState().setCurrentInstance(instanceId)
  }

  const handleSelectServer = (serverId: string, instanceId: string) => {
    if (isOffline(instanceId)) return
    handleActivate(instanceId)
    onSelectServer(serverId, instanceId)
    onClose()
  }

  const handleDisconnect = async (instanceId: string) => {
    setDisconnecting(instanceId)
    try {
      instanceManager.disconnect(instanceId)
      useInstanceStore.getState().setConnected(instanceId, false)
    } finally {
      setDisconnecting(null)
    }
  }

  const handleReconnect = async (instanceId: string) => {
    const inst = savedInstances.find(i => i.id === instanceId)
    if (!inst) return
    setDisconnecting(instanceId) // reuse as loading indicator
    try {
      // Check health first
      useInstanceStore.getState().setOnlineStatus(instanceId, 'checking')
      const isOnline = await instanceManager.checkInstanceHealth(inst.url)
      if (!isOnline) {
        useInstanceStore.getState().setOnlineStatus(instanceId, 'offline')
        return
      }
      useInstanceStore.getState().setOnlineStatus(instanceId, 'online')
      await instanceManager.connect(inst.id, inst.url, inst.name)
      useInstanceStore.getState().setConnected(inst.id, true)
      // Auto-activate after successful reconnect
      handleActivate(inst.id)
    } catch (e) {
      console.error('Reconnect failed:', e)
      useInstanceStore.getState().setOnlineStatus(instanceId, 'offline')
    } finally {
      setDisconnecting(null)
    }
  }

  const handleRemove = (instanceId: string) => {
    instanceManager.disconnect(instanceId)
    removeInstance(instanceId)
    useServerStore.getState().removeInstanceServers(instanceId)
  }

  const getInstanceServers = (instanceId: string) => {
    return servers.filter(s => s.instanceId === instanceId)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="INSTANCES">
      <div className="instance-switcher">
        {savedInstances.length === 0 ? (
          <div className="instance-switcher__empty">
            <GlobeIcon size={36} className="instance-switcher__empty-icon" />
            <p className="instance-switcher__empty-text">No instances added yet</p>
            <p className="instance-switcher__empty-sub">
              Add an instance to start chatting
            </p>
          </div>
        ) : (
          <div className="instance-switcher__list">
            {savedInstances.map((inst) => {
              const isConnected = connectedInstanceIds.includes(inst.id)
              const isActive = activeInstanceId === inst.id
              const isExpanded = expandedId === inst.id
              const isLoading = disconnecting === inst.id
              const instServers = getInstanceServers(inst.id)
              const instanceOffline = isOffline(inst.id)
              const statusValue = getOnlineStatus(inst.id)

              return (
                <div
                  key={inst.id}
                  className={`instance-item ${isActive ? 'instance-item--active' : ''} ${isConnected ? '' : 'instance-item--disconnected'} ${instanceOffline ? 'instance-item--offline' : ''}`}
                >
                  {/* Instance header row */}
                  <div className="instance-item__header" onClick={() => handleToggle(inst.id)}>
                    <div className={`instance-item__icon ${instanceOffline ? 'instance-item__icon--offline' : ''}`}>
                      {inst.iconUrl ? (
                        <img src={inst.iconUrl} alt="" />
                      ) : (
                        <span>{inst.name.substring(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="instance-item__info">
                      <span className={`instance-item__name ${instanceOffline ? 'instance-item__name--offline' : ''}`}>
                        {inst.name}
                      </span>
                      <span className="instance-item__status">
                        {instanceOffline ? (
                          <span className="instance-item__offline-badge">
                            <AlertCircleIcon size={10} /> Instance is Offline
                          </span>
                        ) : statusValue === 'checking' ? (
                          <><WifiIcon size={10} /> Checking...</>
                        ) : isConnected ? (
                          <><WifiIcon size={10} /> Connected</>
                        ) : (
                          <><WifiOffIcon size={10} /> Disconnected</>
                        )}
                        {isConnected && !instanceOffline && ` · ${instServers.length} server${instServers.length !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <div className="instance-item__actions">
                      {!isActive && isConnected && !instanceOffline && (
                        <button
                          className="btn btn--ghost btn--xs"
                          onClick={(e) => { e.stopPropagation(); handleActivate(inst.id) }}
                          data-tooltip="Set Active"
                        >
                          <ZapIcon size={12} />
                        </button>
                      )}
                      <ChevronIcon size={12} direction={isExpanded ? 'up' : 'down'} />
                    </div>
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="instance-item__body">
                      {/* Offline notice */}
                      {instanceOffline && (
                        <div className="instance-item__offline-notice">
                          <AlertCircleIcon size={14} />
                          <div>
                            <strong>Instance is Offline</strong>
                            <p>This instance server is currently unreachable. Content is unavailable until it comes back online.</p>
                          </div>
                        </div>
                      )}

                      {/* Only show servers if online and connected */}
                      {!instanceOffline && isConnected && instServers.length > 0 && (
                        <div className="instance-item__servers">
                          {instServers.map((s) => (
                            <button
                              key={s.id}
                              className={`instance-server-item ${currentServerId === s.id ? 'instance-server-item--active' : ''}`}
                              onClick={() => handleSelectServer(s.id, inst.id)}
                            >
                              <ServerIcon size={12} />
                              <span>{s.name}</span>
                              {s.memberCount !== undefined && (
                                <span className="instance-server-item__count">{s.memberCount}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {!instanceOffline && isConnected && instServers.length === 0 && (
                        <div className="instance-item__no-servers">
                          No servers — browse or create one
                        </div>
                      )}

                      <div className="instance-item__controls">
                        {!instanceOffline && isConnected ? (
                          <button
                            className="btn btn--ghost btn--xs"
                            onClick={() => handleDisconnect(inst.id)}
                            disabled={isLoading}
                          >
                            <WifiOffIcon size={12} /> Disconnect
                          </button>
                        ) : !instanceOffline ? (
                          <button
                            className="btn btn--ghost btn--xs"
                            onClick={() => handleReconnect(inst.id)}
                            disabled={isLoading}
                          >
                            <WifiIcon size={12} /> {isLoading ? 'Connecting...' : 'Reconnect'}
                          </button>
                        ) : (
                          <button
                            className="btn btn--ghost btn--xs"
                            onClick={() => handleReconnect(inst.id)}
                            disabled={isLoading}
                          >
                            <WifiIcon size={12} /> {isLoading ? 'Retrying...' : 'Retry Connection'}
                          </button>
                        )}
                        <button
                          className="btn btn--ghost btn--xs btn--danger"
                          onClick={() => handleRemove(inst.id)}
                        >
                          <TrashIcon size={12} /> Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="instance-switcher__footer">
          <button className="btn btn--primary btn--full" onClick={() => { onClose(); onAddInstance() }}>
            <PlusIcon size={14} /> Add Instance
          </button>
        </div>
      </div>
    </Modal>
  )
}
