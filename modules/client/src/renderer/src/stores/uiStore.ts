import { create } from 'zustand'

export type ViewMode = 'server' | 'dm' | 'discovery' | 'settings' | 'connections'

interface UIState {
  viewMode: ViewMode
  isSidePanelOpen: boolean
  isMemberListOpen: boolean
  activeModal: string | null
  profileUserId: string | null
  /** Channel ID of the lobby whose settings are being edited */
  lobbySettingsChannelId: string | null

  // Actions
  setViewMode: (mode: ViewMode) => void
  toggleSidePanel: () => void
  setSidePanelOpen: (open: boolean) => void
  toggleMemberList: () => void
  setMemberListOpen: (open: boolean) => void
  openModal: (modalId: string) => void
  closeModal: () => void
  openProfile: (userId: string) => void
  closeProfile: () => void
  openLobbySettings: (channelId: string) => void
}

export const useUIStore = create<UIState>()((set) => ({
  viewMode: 'server',
  isSidePanelOpen: true,
  isMemberListOpen: false,
  activeModal: null,
  profileUserId: null,
  lobbySettingsChannelId: null,

  setViewMode: (viewMode) => set({ viewMode }),
  toggleSidePanel: () => set((s) => ({ isSidePanelOpen: !s.isSidePanelOpen })),
  setSidePanelOpen: (isSidePanelOpen) => set({ isSidePanelOpen }),
  toggleMemberList: () => set((s) => ({ isMemberListOpen: !s.isMemberListOpen })),
  setMemberListOpen: (isMemberListOpen) => set({ isMemberListOpen }),
  openModal: (activeModal) => set({ activeModal }),
  closeModal: () => set({ activeModal: null, lobbySettingsChannelId: null }),
  openProfile: (profileUserId) => set({ profileUserId }),
  closeProfile: () => set({ profileUserId: null }),
  openLobbySettings: (channelId) => set({ activeModal: 'lobby-settings', lobbySettingsChannelId: channelId }),
}))
