import React, { useEffect } from 'react';
import { usePanelAuthStore } from './stores/panelAuthStore';
import { usePanelUIStore } from './stores/panelUIStore';
import { panelApi } from './utils/panelApi';
import { Auth } from './components/Auth/Auth';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Header } from './components/Header/Header';
import { ConfirmDialog } from './components/ConfirmDialog/ConfirmDialog';
import { Dashboard } from './components/Dashboard/Dashboard';
import { Settings } from './components/Settings/Settings';
import { Servers } from './components/Servers/Servers';
import { ServerDetail } from './components/Servers/ServerDetail';
import { Members } from './components/Members/Members';
import { MemberDetail } from './components/Members/MemberDetail';
import { Moderation } from './components/Moderation/Moderation';
import { AuditLogs } from './components/AuditLogs/AuditLogs';
import './App.css';

const viewMeta: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'DASHBOARD', subtitle: 'System overview and metrics' },
  settings: { title: 'SETTINGS', subtitle: 'Instance configuration' },
  servers: { title: 'SERVERS', subtitle: 'Server management and oversight' },
  'server-detail': { title: 'SERVER DETAIL', subtitle: 'Server inspection' },
  members: { title: 'MEMBERS', subtitle: 'User management across all servers' },
  'member-detail': { title: 'MEMBER DETAIL', subtitle: 'User inspection' },
  moderation: { title: 'MODERATION', subtitle: 'Cross-server moderation oversight' },
  'audit-logs': { title: 'AUDIT LOGS', subtitle: 'Panel activity log' },
};

const ViewRouter: React.FC = () => {
  const activeView = usePanelUIStore((s) => s.activeView);

  switch (activeView) {
    case 'dashboard':
      return <Dashboard />;
    case 'settings':
      return <Settings />;
    case 'servers':
      return <Servers />;
    case 'server-detail':
      return <ServerDetail />;
    case 'members':
      return <Members />;
    case 'member-detail':
      return <MemberDetail />;
    case 'moderation':
      return <Moderation />;
    case 'audit-logs':
      return <AuditLogs />;
    default:
      return <Dashboard />;
  }
};

const App: React.FC = () => {
  const isAuthenticated = usePanelAuthStore((s) => s.isAuthenticated);
  const token = usePanelAuthStore((s) => s.token);
  const setToken = usePanelAuthStore((s) => s.setToken);
  const clearAuth = usePanelAuthStore((s) => s.clearAuth);
  const activeView = usePanelUIStore((s) => s.activeView);
  const sidebarCollapsed = usePanelUIStore((s) => s.sidebarCollapsed);

  // Wire up panelApi token getter
  useEffect(() => {
    panelApi.setTokenGetter(() => usePanelAuthStore.getState().token);
  }, []);

  // On mount: if we have a persisted token, verify it
  useEffect(() => {
    const verify = async () => {
      if (!token) return;
      try {
        await panelApi.auth.verify();
        // Token is valid — ensure state is synced
        if (!isAuthenticated) setToken(token);
      } catch {
        clearAuth();
      }
    };
    verify();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) {
    return (
      <div className="app">
        <Auth />
      </div>
    );
  }

  const meta = viewMeta[activeView] || viewMeta.dashboard;

  return (
    <div className="app">
      <div className={`app__body ${sidebarCollapsed ? 'app__body--collapsed' : ''}`}>
        <Sidebar />
        <main className="app__content">
          <Header title={meta.title} subtitle={meta.subtitle} />
          <div className="app__content-inner">
            <ViewRouter />
          </div>
        </main>
      </div>
      <ConfirmDialog />
    </div>
  );
};

export default App;
