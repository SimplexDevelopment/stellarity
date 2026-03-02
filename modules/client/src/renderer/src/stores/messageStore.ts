import { create } from 'zustand';

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  encrypted: boolean;
  pinned?: boolean;
  attachments?: any[];
  embeds?: any[];
  replyToId?: string;
  editedAt?: string;
  createdAt: string;
  author?: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

interface MessageState {
  messages: Record<string, Message[]>; // channelId -> messages
  loading: boolean;
  hasMore: Record<string, boolean>;
  typingUsers: Record<string, { userId: string; username: string }[]>;
  
  // Actions
  setMessages: (channelId: string, messages: Message[]) => void;
  addMessage: (channelId: string, message: Message) => void;
  prependMessages: (channelId: string, messages: Message[]) => void;
  updateMessage: (channelId: string, message: Message) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  setLoading: (loading: boolean) => void;
  setHasMore: (channelId: string, hasMore: boolean) => void;
  addTypingUser: (channelId: string, user: { userId: string; username: string }) => void;
  removeTypingUser: (channelId: string, oderId: string) => void;
  clearChannel: (channelId: string) => void;
  reset: () => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: {},
  loading: false,
  hasMore: {},
  typingUsers: {},
  
  setMessages: (channelId, messages) => set((state) => ({
    messages: { ...state.messages, [channelId]: messages },
  })),
  
  addMessage: (channelId, message) => set((state) => {
    const existing = state.messages[channelId] || [];
    // Avoid duplicates
    if (existing.some((m) => m.id === message.id)) {
      return state;
    }
    return {
      messages: { ...state.messages, [channelId]: [...existing, message] },
    };
  }),
  
  prependMessages: (channelId, messages) => set((state) => {
    const existing = state.messages[channelId] || [];
    const existingIds = new Set(existing.map((m) => m.id));
    const newMessages = messages.filter((m) => !existingIds.has(m.id));
    return {
      messages: { ...state.messages, [channelId]: [...newMessages, ...existing] },
    };
  }),
  
  updateMessage: (channelId, message) => set((state) => {
    const existing = state.messages[channelId] || [];
    return {
      messages: {
        ...state.messages,
        [channelId]: existing.map((m) => (m.id === message.id ? message : m)),
      },
    };
  }),
  
  deleteMessage: (channelId, messageId) => set((state) => {
    const existing = state.messages[channelId] || [];
    return {
      messages: {
        ...state.messages,
        [channelId]: existing.filter((m) => m.id !== messageId),
      },
    };
  }),
  
  setLoading: (loading) => set({ loading }),
  
  setHasMore: (channelId, hasMore) => set((state) => ({
    hasMore: { ...state.hasMore, [channelId]: hasMore },
  })),
  
  addTypingUser: (channelId, user) => set((state) => {
    const existing = state.typingUsers[channelId] || [];
    if (existing.some((u) => u.userId === user.userId)) {
      return state;
    }
    return {
      typingUsers: { ...state.typingUsers, [channelId]: [...existing, user] },
    };
  }),
  
  removeTypingUser: (channelId, userId) => set((state) => {
    const existing = state.typingUsers[channelId] || [];
    return {
      typingUsers: {
        ...state.typingUsers,
        [channelId]: existing.filter((u) => u.userId !== userId),
      },
    };
  }),
  
  clearChannel: (channelId) => set((state) => {
    const { [channelId]: _, ...rest } = state.messages;
    return { messages: rest };
  }),
  
  reset: () => set({ messages: {}, loading: false, hasMore: {}, typingUsers: {} }),
}));
