/**
 * Server Store
 * 
 * Manages servers across multiple connected instances.
 * Each server is tagged with its instanceId so the UI
 * can group them and route API calls to the right instance.
 */
import { create } from 'zustand';

interface Server {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  ownerId: string;
  inviteCode: string;
  memberCount?: number;
  isPublic: boolean;
  hasPassword: boolean;
  instanceId: string;      // Which instance this server belongs to
  instanceName: string;    // Display name of the instance
}

interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice';
  description: string | null;
  categoryId: string | null;
  position: number;
  bitrate: number;
  userLimit: number;
  isTemporary: boolean;
  createdBy: string | null;
  expiresWhenEmpty: boolean;
  hasPassword: boolean;
}

interface Category {
  id: string;
  serverId: string;
  name: string;
  position: number;
}

interface Role {
  id: string;
  serverId: string;
  name: string;
  color: string | null;
  position: number;
  permissions: Record<string, boolean>;
}

interface Member {
  id: string;
  oderId: string;
  userId: string;
  nickname: string | null;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: string;
  };
}

export interface VoiceOccupantUser {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
}

export interface VoiceChannelOccupancy {
  channelId: string;
  users: VoiceOccupantUser[];
}

export interface ServerFeatures {
  buildALobbyEnabled: boolean;
  buildALobbyPosition: number;
  autoOverflowEnabled: boolean;
}

/** Sidebar view mode */
type SidebarView = 'servers' | 'channels';

interface ServerState {
  servers: Server[];
  currentServerId: string | null;
  currentChannelId: string | null;
  currentInstanceId: string | null;
  channels: Channel[];
  categories: Category[];
  roles: Role[];
  members: Member[];
  onlineUsers: Set<string>;
  sidebarView: SidebarView;
  voiceOccupancy: VoiceChannelOccupancy[];
  serverFeatures: ServerFeatures;
  
  // Actions
  setServers: (servers: Server[]) => void;
  addServer: (server: Server) => void;
  updateServer: (serverId: string, updates: Partial<Server>) => void;
  removeServer: (serverId: string) => void;
  setCurrentServer: (serverId: string | null) => void;
  setCurrentChannel: (channelId: string | null) => void;
  setChannels: (channels: Channel[]) => void;
  addChannel: (channel: Channel) => void;
  updateChannel: (channelId: string, updates: Partial<Channel>) => void;
  removeChannel: (channelId: string) => void;
  setCategories: (categories: Category[]) => void;
  addCategory: (category: Category) => void;
  updateCategory: (categoryId: string, updates: Partial<Category>) => void;
  removeCategory: (categoryId: string) => void;
  setRoles: (roles: Role[]) => void;
  addRole: (role: Role) => void;
  updateRole: (roleId: string, updates: Partial<Role>) => void;
  removeRole: (roleId: string) => void;
  setMembers: (members: Member[]) => void;
  setUserOnline: (oderId: string, online: boolean) => void;
  setSidebarView: (view: SidebarView) => void;
  setVoiceOccupancy: (occupancy: VoiceChannelOccupancy[]) => void;
  addUserToChannelOccupancy: (channelId: string, user: VoiceOccupantUser) => void;
  removeUserFromChannelOccupancy: (channelId: string, userId: string) => void;
  setServerFeatures: (features: ServerFeatures) => void;
  
  // Multi-instance actions
  addInstanceServers: (instanceId: string, servers: Server[]) => void;
  removeInstanceServers: (instanceId: string) => void;
  setCurrentInstance: (instanceId: string | null) => void;
  
  reset: () => void;
}

export const useServerStore = create<ServerState>((set) => ({
  servers: [],
  currentServerId: null,
  currentChannelId: null,
  currentInstanceId: null,
  channels: [],
  categories: [],
  roles: [],
  members: [],
  onlineUsers: new Set(),
  sidebarView: 'servers',
  voiceOccupancy: [],
  serverFeatures: {
    buildALobbyEnabled: true,
    buildALobbyPosition: 0,
    autoOverflowEnabled: true,
  },
  
  setServers: (servers) => set((state) => ({
    servers,
    currentServerId: state.currentServerId || (servers.length > 0 ? servers[0].id : null),
  })),
  
  addServer: (server) => set((state) => ({
    servers: [...state.servers, server]
  })),

  updateServer: (serverId, updates) => set((state) => ({
    servers: state.servers.map(s => s.id === serverId ? { ...s, ...updates } : s),
  })),
  
  removeServer: (serverId) => set((state) => ({
    servers: state.servers.filter((s) => s.id !== serverId),
    currentServerId: state.currentServerId === serverId ? null : state.currentServerId,
    sidebarView: state.currentServerId === serverId ? 'servers' : state.sidebarView,
  })),
  
  setCurrentServer: (serverId) => set((state) => {
    const server = state.servers.find(s => s.id === serverId);
    return {
      currentServerId: serverId,
      currentInstanceId: server?.instanceId || state.currentInstanceId,
      currentChannelId: null,
      channels: [],
      categories: [],
      roles: [],
      members: [],
      sidebarView: serverId ? 'channels' : state.sidebarView,
    };
  }),
  
  setCurrentChannel: (channelId) => set({ currentChannelId: channelId }),
  
  setChannels: (channels) => set({ channels }),
  
  addChannel: (channel) => set((state) => ({
    channels: [...state.channels, channel]
  })),

  updateChannel: (channelId, updates) => set((state) => ({
    channels: state.channels.map(c => c.id === channelId ? { ...c, ...updates } : c),
  })),

  removeChannel: (channelId) => set((state) => ({
    channels: state.channels.filter(c => c.id !== channelId),
    currentChannelId: state.currentChannelId === channelId ? null : state.currentChannelId,
  })),

  setCategories: (categories) => set({ categories }),

  addCategory: (category) => set((state) => ({
    categories: [...state.categories, category],
  })),

  updateCategory: (categoryId, updates) => set((state) => ({
    categories: state.categories.map(c => c.id === categoryId ? { ...c, ...updates } : c),
  })),

  removeCategory: (categoryId) => set((state) => ({
    categories: state.categories.filter(c => c.id !== categoryId),
    // Channels in this category become uncategorized
    channels: state.channels.map(ch => ch.categoryId === categoryId ? { ...ch, categoryId: null } : ch),
  })),

  setRoles: (roles) => set({ roles }),

  addRole: (role) => set((state) => ({
    roles: [...state.roles, role],
  })),

  updateRole: (roleId, updates) => set((state) => ({
    roles: state.roles.map(r => r.id === roleId ? { ...r, ...updates } : r),
  })),

  removeRole: (roleId) => set((state) => ({
    roles: state.roles.filter(r => r.id !== roleId),
  })),
  
  setMembers: (members) => set({ members }),
  
  setUserOnline: (oderId, online) => set((state) => {
    const newOnlineUsers = new Set(state.onlineUsers);
    if (online) {
      newOnlineUsers.add(oderId);
    } else {
      newOnlineUsers.delete(oderId);
    }
    return { onlineUsers: newOnlineUsers };
  }),

  setSidebarView: (view) => set({ sidebarView: view }),

  setVoiceOccupancy: (occupancy) => set({ voiceOccupancy: occupancy }),

  addUserToChannelOccupancy: (channelId, user) => set((state) => {
    const existing = state.voiceOccupancy.find(o => o.channelId === channelId);
    if (existing) {
      // Don't add duplicates
      if (existing.users.some(u => u.userId === user.userId)) return state;
      return {
        voiceOccupancy: state.voiceOccupancy.map(o =>
          o.channelId === channelId
            ? { ...o, users: [...o.users, user] }
            : o
        ),
      };
    }
    return {
      voiceOccupancy: [...state.voiceOccupancy, { channelId, users: [user] }],
    };
  }),

  removeUserFromChannelOccupancy: (channelId, userId) => set((state) => ({
    voiceOccupancy: state.voiceOccupancy
      .map(o => o.channelId === channelId
        ? { ...o, users: o.users.filter(u => u.userId !== userId) }
        : o
      )
      .filter(o => o.users.length > 0),
  })),

  setServerFeatures: (features) => set({ serverFeatures: features }),
  
  // Multi-instance: add servers from a specific instance
  addInstanceServers: (instanceId, servers) => set((state) => ({
    servers: [
      ...state.servers.filter(s => s.instanceId !== instanceId),
      ...servers,
    ],
  })),
  
  // Multi-instance: remove all servers from a specific instance
  removeInstanceServers: (instanceId) => set((state) => ({
    servers: state.servers.filter(s => s.instanceId !== instanceId),
    currentServerId: state.servers.find(s => s.id === state.currentServerId)?.instanceId === instanceId
      ? null : state.currentServerId,
  })),
  
  setCurrentInstance: (instanceId) => set({ currentInstanceId: instanceId }),
  
  reset: () => set({
    servers: [],
    currentServerId: null,
    currentChannelId: null,
    currentInstanceId: null,
    channels: [],
    categories: [],
    roles: [],
    members: [],
    onlineUsers: new Set(),
    sidebarView: 'servers',
    voiceOccupancy: [],
    serverFeatures: {
      buildALobbyEnabled: true,
      buildALobbyPosition: 0,
      autoOverflowEnabled: true,
    },
  }),
}));
