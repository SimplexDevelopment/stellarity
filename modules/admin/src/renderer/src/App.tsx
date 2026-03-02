import React, { useEffect } from 'react'
import { useAdminAuthStore } from './stores/adminAuthStore'
import { useAdminUIStore } from './stores/adminUIStore'
import { adminApi } from './utils/adminApi'
import { TitleBar } from './components/TitleBar/TitleBar'
import { TelemetryBar } from './components/TelemetryBar/TelemetryBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { AuthScreen as Auth } from './components/Auth/Auth'
import { Dashboard } from './components/Dashboard/Dashboard'
import { UserManagement } from './components/UserManagement/UserManagement'
import { InstanceManagement } from './components/InstanceManagement/InstanceManagement'
import { AuditLogs } from './components/AuditLogs/AuditLogs'
import { SubscriptionManagement } from './components/SubscriptionManagement/SubscriptionManagement'
import { DmBuffer } from './components/DmBuffer/DmBuffer'
import { AdminAccounts } from './components/AdminAccounts/AdminAccounts'
import { ConfirmDialog } from './components/ConfirmDialog/ConfirmDialog'
import './App.css'

const ViewRouter: React.FC = () => {
  const activeView = useAdminUIStore((s) => s.activeView)

  switch (activeView) {
    case 'dashboard':
      return <Dashboard />
    case 'users':
      return <UserManagement />
    case 'instances':
      return <InstanceManagement />
    case 'audit-logs':
      return <AuditLogs />
    case 'subscriptions':
      return <SubscriptionManagement />
    case 'dm-buffer':
      return <DmBuffer />
    case 'admin-accounts':
      return <AdminAccounts />
    case 'settings':
      return <div className="settings-placeholder"><p>Settings — coming soon</p></div>
    default:
      return <Dashboard />
  }
}

const App: React.FC = () => {
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated)
  const accessToken = useAdminAuthStore((s) => s.accessToken)
  const refreshToken = useAdminAuthStore((s) => s.refreshToken)
  const setTokens = useAdminAuthStore((s) => s.setTokens)
  const setAdmin = useAdminAuthStore((s) => s.setAdmin)
  const clearAuth = useAdminAuthStore((s) => s.clearAuth)
  const sidebarCollapsed = useAdminUIStore((s) => s.sidebarCollapsed)

  // Wire up adminApi token getter
  useEffect(() => {
    adminApi.setTokenGetter(() => useAdminAuthStore.getState().accessToken)
  }, [])

  // On mount: if we have tokens, verify them and refresh profile
  useEffect(() => {
    const bootstrap = async () => {
      if (!accessToken || !refreshToken) return

      try {
        const { admin } = await adminApi.auth.me()
        setAdmin({
          id: admin.id,
          username: admin.username,
          displayName: admin.display_name || admin.username,
          role: admin.role,
          mfaEnabled: admin.mfa_enabled,
        })
      } catch {
        // Access token expired — try refresh
        try {
          const res = await adminApi.auth.refresh(refreshToken)
          setTokens(res.accessToken, res.refreshToken)
          const { admin } = await adminApi.auth.me()
          setAdmin({
            id: admin.id,
            username: admin.username,
            displayName: admin.display_name || admin.username,
            role: admin.role,
            mfaEnabled: admin.mfa_enabled,
          })
        } catch {
          clearAuth()
        }
      }
    }
    bootstrap()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Token refresh interval (every 20 minutes)
  useEffect(() => {
    if (!isAuthenticated) return

    const interval = setInterval(async () => {
      const rt = useAdminAuthStore.getState().refreshToken
      if (!rt) return
      try {
        const res = await adminApi.auth.refresh(rt)
        setTokens(res.accessToken, res.refreshToken)
      } catch {
        clearAuth()
      }
    }, 20 * 60 * 1000)

    return () => clearInterval(interval)
  }, [isAuthenticated, setTokens, clearAuth])

  if (!isAuthenticated) {
    return (
      <div className="app">
        <TitleBar />
        <Auth />
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar />
      <TelemetryBar />
      <div className={`app__body ${sidebarCollapsed ? 'app__body--collapsed' : ''}`}>
        <Sidebar />
        <main className="app__content">
          <ViewRouter />
        </main>
      </div>
      <ConfirmDialog />
    </div>
  )
}

export default App
