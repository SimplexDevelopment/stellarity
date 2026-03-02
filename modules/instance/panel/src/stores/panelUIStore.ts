import { create } from 'zustand';

export type PanelView =
  | 'dashboard'
  | 'settings'
  | 'servers'
  | 'server-detail'
  | 'members'
  | 'member-detail'
  | 'moderation'
  | 'audit-logs'
  | 'database'
  | 'database-table';

interface ConfirmDialog {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
}

interface PanelUIState {
  activeView: PanelView;
  sidebarCollapsed: boolean;
  confirmDialog: ConfirmDialog | null;

  // Detail view context
  selectedServerId: string | null;
  selectedMemberId: string | null;
  selectedTableName: string | null;

  setActiveView: (view: PanelView) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  showConfirmDialog: (dialog: ConfirmDialog) => void;
  closeConfirmDialog: () => void;
  viewServer: (serverId: string) => void;
  viewMember: (userId: string) => void;
  viewTable: (tableName: string) => void;
}

export const usePanelUIStore = create<PanelUIState>()((set) => ({
  activeView: 'dashboard',
  sidebarCollapsed: false,
  confirmDialog: null,
  selectedServerId: null,
  selectedMemberId: null,
  selectedTableName: null,

  setActiveView: (activeView) => set({ activeView, selectedServerId: null, selectedMemberId: null, selectedTableName: null }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  showConfirmDialog: (confirmDialog) => set({ confirmDialog }),
  closeConfirmDialog: () => set({ confirmDialog: null }),
  viewServer: (serverId) => set({ activeView: 'server-detail', selectedServerId: serverId }),
  viewMember: (userId) => set({ activeView: 'member-detail', selectedMemberId: userId }),
  viewTable: (tableName) => set({ activeView: 'database-table', selectedTableName: tableName }),
}));
