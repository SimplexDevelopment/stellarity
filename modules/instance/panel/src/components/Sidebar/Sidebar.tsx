import React from 'react';
import { usePanelUIStore, type PanelView } from '../../stores/panelUIStore';
import { usePanelAuthStore } from '../../stores/panelAuthStore';
import './Sidebar.css';

interface NavItem {
  id: PanelView;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'servers', label: 'Servers', icon: '▣' },
  { id: 'members', label: 'Members', icon: '◉' },
  { id: 'moderation', label: 'Moderation', icon: '⚑' },
  { id: 'audit-logs', label: 'Audit Logs', icon: '☰' },
];

export const Sidebar: React.FC = () => {
  const activeView = usePanelUIStore((s) => s.activeView);
  const setActiveView = usePanelUIStore((s) => s.setActiveView);
  const sidebarCollapsed = usePanelUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = usePanelUIStore((s) => s.toggleSidebar);
  const clearAuth = usePanelAuthStore((s) => s.clearAuth);

  // Treat detail views as their parent for nav highlighting
  const activeNavId: PanelView =
    activeView === 'server-detail' ? 'servers' :
    activeView === 'member-detail' ? 'members' :
    activeView;

  return (
    <nav className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__header">
        <button className="sidebar__toggle btn--icon btn--ghost" onClick={toggleSidebar}>
          {sidebarCollapsed ? '▷' : '◁'}
        </button>
        {!sidebarCollapsed && <span className="sidebar__brand">PANEL</span>}
      </div>

      <div className="sidebar__nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar__item ${activeNavId === item.id ? 'sidebar__item--active' : ''}`}
            onClick={() => setActiveView(item.id)}
            data-tooltip={sidebarCollapsed ? item.label : undefined}
          >
            <span className="sidebar__icon">{item.icon}</span>
            {!sidebarCollapsed && <span className="sidebar__label">{item.label}</span>}
          </button>
        ))}
      </div>

      <div className="sidebar__footer">
        <button className="sidebar__logout" onClick={clearAuth} data-tooltip={sidebarCollapsed ? 'Logout' : undefined}>
          <span className="sidebar__icon">⏻</span>
          {!sidebarCollapsed && <span className="sidebar__label">Logout</span>}
        </button>
      </div>
    </nav>
  );
};
