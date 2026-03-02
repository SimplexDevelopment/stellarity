import React from 'react'
import { useAdminAuthStore } from '../../stores/adminAuthStore'
import { useAdminUIStore, type AdminView } from '../../stores/adminUIStore'
import { adminApi } from '../../utils/adminApi'
import {
  DashboardIcon,
  UsersIcon,
  ServerIcon,
  AuditLogIcon,
  CreditCardIcon,
  MailIcon,
  ShieldIcon,
  SettingsIcon,
  LogOutIcon,
  MenuIcon,
} from '../Icons'
import './Sidebar.css'

interface NavItem {
  id: AdminView
  label: string
  icon: React.FC<{ size?: number; className?: string }>
  superadminOnly?: boolean
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
  { id: 'users', label: 'Users', icon: UsersIcon },
  { id: 'instances', label: 'Instances', icon: ServerIcon },
  { id: 'audit-logs', label: 'Audit Logs', icon: AuditLogIcon },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCardIcon },
  { id: 'dm-buffer', label: 'DM Buffer', icon: MailIcon },
  { id: 'admin-accounts', label: 'Admins', icon: ShieldIcon, superadminOnly: true },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

export const Sidebar: React.FC = () => {
  const { admin, clearAuth } = useAdminAuthStore()
  const { activeView, setActiveView, sidebarCollapsed, toggleSidebar } = useAdminUIStore()

  const handleLogout = async () => {
    try {
      const refreshToken = useAdminAuthStore.getState().refreshToken
      await adminApi.auth.logout(refreshToken || undefined)
    } catch {
      // ignore
    }
    clearAuth()
  }

  const filteredItems = navItems.filter(
    (item) => !item.superadminOnly || admin?.role === 'superadmin'
  )

  return (
    <div className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar-header">
        <button className="sidebar-toggle" onClick={toggleSidebar}>
          <MenuIcon size={16} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {filteredItems.map((item) => {
          const IconComponent = item.icon
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              className={`sidebar-item ${isActive ? 'sidebar-item--active' : ''}`}
              onClick={() => setActiveView(item.id)}
              data-tooltip={sidebarCollapsed ? item.label : undefined}
            >
              <IconComponent size={18} className="sidebar-item__icon" />
              {!sidebarCollapsed && (
                <span className="sidebar-item__label">{item.label}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-admin">
          <div className="sidebar-admin__avatar">
            {admin?.username?.[0]?.toUpperCase() || 'A'}
          </div>
          {!sidebarCollapsed && (
            <div className="sidebar-admin__info">
              <span className="sidebar-admin__name">{admin?.displayName || admin?.username}</span>
              <span className="sidebar-admin__role">{admin?.role}</span>
            </div>
          )}
        </div>
        <button
          className="sidebar-item sidebar-item--logout"
          onClick={handleLogout}
          data-tooltip={sidebarCollapsed ? 'Logout' : undefined}
        >
          <LogOutIcon size={18} className="sidebar-item__icon" />
          {!sidebarCollapsed && (
            <span className="sidebar-item__label">Logout</span>
          )}
        </button>
      </div>
    </div>
  )
}
