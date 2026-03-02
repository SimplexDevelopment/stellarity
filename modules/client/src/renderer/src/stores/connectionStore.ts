/**
 * Connection Store
 *
 * Manages connections (friends), incoming/outgoing requests, and blocked users.
 * All data lives on the central server; this store caches it locally.
 */
import { create } from 'zustand';

/** Minimal user info for connection displays */
interface FriendUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  statusMessage: string | null;
}

/** An accepted connection (friendship) */
interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  friend: FriendUser;
}

/** A pending connection request */
interface FriendRequest {
  id: string;
  senderId: string;
  recipientId: string;
  message: string | null;
  createdAt: string;
  sender: FriendUser;
}

type ConnectionTab = 'all' | 'pending' | 'blocked' | 'add';

interface ConnectionState {
  // Data
  connections: Friendship[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blockedUsers: FriendUser[];

  // UI
  activeTab: ConnectionTab;
  isLoading: boolean;
  error: string | null;

  // Actions — data
  setConnections: (connections: Friendship[]) => void;
  setIncomingRequests: (requests: FriendRequest[]) => void;
  setOutgoingRequests: (requests: FriendRequest[]) => void;
  setBlockedUsers: (users: FriendUser[]) => void;
  addConnection: (connection: Friendship) => void;
  removeConnection: (friendshipId: string) => void;
  addIncomingRequest: (request: FriendRequest) => void;
  removeIncomingRequest: (friendshipId: string) => void;
  removeOutgoingRequest: (friendshipId: string) => void;

  // Actions — UI
  setActiveTab: (tab: ConnectionTab) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  connections: [],
  incomingRequests: [],
  outgoingRequests: [],
  blockedUsers: [],
  activeTab: 'all' as ConnectionTab,
  isLoading: false,
  error: null,
};

export const useConnectionStore = create<ConnectionState>((set) => ({
  ...initialState,

  setConnections: (connections) => set({ connections }),
  setIncomingRequests: (requests) => set({ incomingRequests: requests }),
  setOutgoingRequests: (requests) => set({ outgoingRequests: requests }),
  setBlockedUsers: (users) => set({ blockedUsers: users }),

  addConnection: (connection) =>
    set((s) => ({ connections: [connection, ...s.connections] })),

  removeConnection: (friendshipId) =>
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== friendshipId),
    })),

  addIncomingRequest: (request) =>
    set((s) => ({ incomingRequests: [request, ...s.incomingRequests] })),

  removeIncomingRequest: (friendshipId) =>
    set((s) => ({
      incomingRequests: s.incomingRequests.filter((r) => r.id !== friendshipId),
    })),

  removeOutgoingRequest: (friendshipId) =>
    set((s) => ({
      outgoingRequests: s.outgoingRequests.filter((r) => r.id !== friendshipId),
    })),

  setActiveTab: (activeTab) => set({ activeTab }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
