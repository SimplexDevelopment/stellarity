import React, { useState, useRef, useEffect } from 'react'
import { useServerStore } from '../../stores/serverStore'
import { useInstanceStore } from '../../stores/instanceStore'
import { useUIStore } from '../../stores/uiStore'
import {
  ChevronIcon,
  ServerIcon,
  PlusIcon,
  GearIcon,
  FriendsIcon,
  MessageIcon,
  SidebarIcon,
  CompassIcon,
  LayersIcon,
  GlobeIcon,
} from '../Icons'
import './NavTabs.css'

export const NavTabs: React.FC = () => {
  const { servers, currentServerId, setCurrentServer } = useServerStore()
  const { savedInstances, activeInstanceId, connectedInstanceIds } = useInstanceStore()
  const { viewMode, setViewMode, isSidePanelOpen, toggleSidePanel, openModal } = useUIStore()

  const [serverDropdownOpen, setServerDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentServer = servers.find((s) => s.id === currentServerId)
  const activeInstance = savedInstances.find((i) => i.id === activeInstanceId)
  const activeInstanceServers = servers.filter((s) => s.instanceId === activeInstanceId)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setServerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelectServer = (id: string) => {
    setCurrentServer(id)
    setServerDropdownOpen(false)
    if (viewMode !== 'server') setViewMode('server')
  }

  const connectedCount = connectedInstanceIds.length
  const instanceLabel = activeInstance ? activeInstance.name : 'No Instance'

  return (
    <nav className="navtabs">
      {/* Sidebar toggle */}
      <button
        className="navtabs-btn navtabs-btn--toggle"
        onClick={toggleSidePanel}
        data-tooltip={isSidePanelOpen ? 'Hide Panel' : 'Show Panel'}
      >
        <SidebarIcon size={16} />
      </button>

      <div className="navtabs-divider" />

      {/* Instance Indicator + Switcher */}
      <button
        className="navtabs-btn navtabs-btn--instance"
        onClick={() => openModal('instance-switcher')}
        data-tooltip="Switch Instance"
      >
        <LayersIcon size={14} />
        <span className="navtabs-btn__label navtabs-instance-label">
          {instanceLabel}
        </span>
        {connectedCount > 0 && (
          <span className="navtabs-instance-badge">{connectedCount}</span>
        )}
      </button>

      <div className="navtabs-divider" />

      {/* Server Dropdown — scoped to active instance */}
      <div className="navtabs-dropdown" ref={dropdownRef}>
        <button
          className={`navtabs-btn navtabs-btn--server ${viewMode === 'server' ? 'active' : ''}`}
          onClick={() => setServerDropdownOpen((v) => !v)}
        >
          <ServerIcon size={14} />
          <span className="navtabs-btn__label">
            {currentServer ? currentServer.name : 'Select Server'}
          </span>
          <ChevronIcon size={10} direction={serverDropdownOpen ? 'up' : 'down'} />
        </button>

        {serverDropdownOpen && (
          <div className="navtabs-dropdown__menu">
            {activeInstanceServers.length === 0 && (
              <div className="navtabs-dropdown__empty">
                {activeInstance ? 'No servers on this instance' : 'Select an instance first'}
              </div>
            )}
            {activeInstanceServers.map((s) => (
              <button
                key={s.id}
                className={`navtabs-dropdown__item ${s.id === currentServerId ? 'active' : ''}`}
                onClick={() => handleSelectServer(s.id)}
              >
                <span className="navtabs-dropdown__icon">
                  {s.name.substring(0, 2).toUpperCase()}
                </span>
                <span className="navtabs-dropdown__name">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* DM tab */}
      <button
        className={`navtabs-btn ${viewMode === 'dm' ? 'active' : ''}`}
        onClick={() => setViewMode('dm')}
        data-tooltip="Direct Messages"
      >
        <MessageIcon size={14} />
        <span className="navtabs-btn__label">DMs</span>
      </button>

      {/* Discover tab */}
      <button
        className={`navtabs-btn ${viewMode === 'discovery' ? 'active' : ''}`}
        onClick={() => setViewMode('discovery')}
        data-tooltip="Discover Instances"
      >
        <CompassIcon size={14} />
        <span className="navtabs-btn__label">Discover</span>
      </button>

      {/* Friends tab */}
      <button
        className={`navtabs-btn ${viewMode === 'dm' ? '' : ''}`}
        data-tooltip="Friends List"
      >
        <FriendsIcon size={14} />
      </button>

      {/* Spacer */}
      <div className="navtabs-spacer" />

      {/* Settings */}
      <button
        className={`navtabs-btn ${viewMode === 'settings' ? 'active' : ''}`}
        onClick={() => setViewMode(viewMode === 'settings' ? 'server' : 'settings')}
        data-tooltip="Settings"
      >
        <GearIcon size={14} />
      </button>
    </nav>
  )
}
