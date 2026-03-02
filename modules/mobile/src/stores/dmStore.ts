/**
 * DM Store
 * 
 * Manages direct message conversations and pending messages.
 * DMs primarily use P2P WebRTC data channels;
 * this store also handles the central server buffer fallback.
 */
import { create } from 'zustand';

interface DMConversation {
  id: string;
  participants: Array<{
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: string;
    statusMessage: string | null;
  }>;
  lastMessageAt: string | null;
  unreadCount: number;
}

interface PendingDM {
  id: string;
  senderId: string;
  senderUsername: string;
  contentEncrypted: string;
  createdAt: string;
  expiresAt: string;
}

interface DMState {
  conversations: DMConversation[];
  pendingMessages: PendingDM[];
  pendingCount: number;
  isLoading: boolean;
  
  // Actions
  setConversations: (conversations: DMConversation[]) => void;
  setPendingMessages: (messages: PendingDM[]) => void;
  setPendingCount: (count: number) => void;
  setLoading: (loading: boolean) => void;
  clearPending: (messageIds: string[]) => void;
  reset: () => void;
}

export const useDMStore = create<DMState>((set) => ({
  conversations: [],
  pendingMessages: [],
  pendingCount: 0,
  isLoading: false,

  setConversations: (conversations) => set({ conversations }),

  setPendingMessages: (messages) => set({
    pendingMessages: messages,
    pendingCount: messages.length,
  }),

  setPendingCount: (count) => set({ pendingCount: count }),

  setLoading: (loading) => set({ isLoading: loading }),

  clearPending: (messageIds) => set((state) => ({
    pendingMessages: state.pendingMessages.filter(m => !messageIds.includes(m.id)),
    pendingCount: Math.max(0, state.pendingCount - messageIds.length),
  })),

  reset: () => set({
    conversations: [],
    pendingMessages: [],
    pendingCount: 0,
    isLoading: false,
  }),
}));
