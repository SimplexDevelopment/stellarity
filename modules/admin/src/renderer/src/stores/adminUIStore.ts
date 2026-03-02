/**
 * Admin UI Store
 * 
 * Manages admin panel UI state: active view, modals, sidebar.
 */
import { create } from 'zustand';

export type AdminView =
  | 'dashboard'
  | 'users'
  | 'instances'
  | 'audit-logs'
  | 'subscriptions'
  | 'dm-buffer'
  | 'admin-accounts'
  | 'settings';

interface ConfirmDialog {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
}

interface AdminUIState {
  activeView: AdminView;
  sidebarCollapsed: boolean;
  confirmDialog: ConfirmDialog | null;

  // Actions
  setActiveView: (view: AdminView) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  showConfirmDialog: (dialog: ConfirmDialog) => void;
  closeConfirmDialog: () => void;
}

export const useAdminUIStore = create<AdminUIState>()((set) => ({
  activeView: 'dashboard',
  sidebarCollapsed: false,
  confirmDialog: null,

  setActiveView: (activeView) => set({ activeView }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  showConfirmDialog: (confirmDialog) => set({ confirmDialog }),
  closeConfirmDialog: () => set({ confirmDialog: null }),
}));
