import React from 'react';
import { useServerStore } from '../../stores/serverStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import {
  MessageIcon,
  CompassIcon,
  LayersIcon,
  GearIcon,
} from '../Icons';
import './ServerList.css';

interface ServerIconProps {
  server: {
    id: string;
    name: string;
    iconUrl: string | null;
  };
  isActive: boolean;
  onClick: () => void;
}

const ServerIcon: React.FC<ServerIconProps> = ({ server, isActive, onClick }) => {
  const initials = server.name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  
  return (
    <div className={`server-icon-wrapper ${isActive ? 'active' : ''}`}>
      <div className="server-indicator" />
      <button className="server-icon" onClick={onClick} title={server.name}>
        {server.iconUrl ? (
          <img src={server.iconUrl} alt={server.name} />
        ) : (
          <span className="server-initials">{initials}</span>
        )}
      </button>
    </div>
  );
};

interface ServerListProps {
  onAddServer: () => void;
}

export const ServerList: React.FC<ServerListProps> = ({ onAddServer }) => {
  const { servers, currentServerId, setCurrentServer } = useServerStore();
  const { connectedInstanceIds, activeInstanceId } = useInstanceStore();
  const { viewMode, setViewMode, openModal } = useUIStore();
  const { user } = useAuthStore();

  const connectedCount = connectedInstanceIds.length;

  // Filter servers to only show those from the active instance
  const visibleServers = activeInstanceId
    ? servers.filter((s) => s.instanceId === activeInstanceId)
    : servers;

  const handleServerClick = (serverId: string) => {
    // Only call setCurrentServer when switching to a different server —
    // it clears channels/categories/roles/members and the reload effect
    // won't re-fire if the serverId hasn't actually changed.
    if (serverId !== currentServerId) {
      setCurrentServer(serverId);
    }
    if (viewMode !== 'server') setViewMode('server');
  };

  return (
    <div className="server-list">
      {/* User avatar — opens Connections view */}
      <div className="server-list-header">
        <div
          className={`user-avatar ${viewMode === 'connections' ? 'active' : ''}`}
          onClick={() => setViewMode('connections')}
          title="Connections"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.displayName || user.username} />
          ) : (
            <span>{(user?.displayName || user?.username || 'U')[0].toUpperCase()}</span>
          )}
          <div className="status-dot online" />
        </div>
      </div>

      <div className="server-divider" />

      {/* Server icons — scrollable */}
      <div className="server-list-scroll">
        {visibleServers.map((server) => (
          <ServerIcon
            key={server.id}
            server={server}
            isActive={currentServerId === server.id && viewMode === 'server'}
            onClick={() => handleServerClick(server.id)}
          />
        ))}

        <button className="server-icon add-server" onClick={onAddServer} title="Add Server">
          <span>+</span>
        </button>
      </div>

      <div className="server-divider" />

      {/* Navigation */}
      <div className="server-list-nav">
        <button
          className={`nav-icon-btn ${viewMode === 'dm' ? 'active' : ''}`}
          onClick={() => setViewMode('dm')}
          title="Direct Messages"
        >
          <MessageIcon size={18} />
        </button>
        <button
          className={`nav-icon-btn ${viewMode === 'discovery' ? 'active' : ''}`}
          onClick={() => setViewMode('discovery')}
          title="Discover"
        >
          <CompassIcon size={18} />
        </button>
      </div>

      <div className="server-divider" />

      {/* Footer: Instance + Settings */}
      <div className="server-list-footer">
        <button
          className="nav-icon-btn nav-icon-btn--instance"
          onClick={() => openModal('instance-switcher')}
          title="Switch Instance"
        >
          <LayersIcon size={18} />
          {connectedCount > 0 && (
            <span className="nav-icon-badge">{connectedCount}</span>
          )}
        </button>
        <button
          className={`nav-icon-btn ${viewMode === 'settings' ? 'active' : ''}`}
          onClick={() => setViewMode(viewMode === 'settings' ? 'server' : 'settings')}
          title="Settings"
        >
          <GearIcon size={18} />
        </button>
      </div>
    </div>
  );
};
