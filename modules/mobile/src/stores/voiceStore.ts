import { create } from 'zustand';

interface VoiceUser {
  oderId: string; // Keep as oderId for backward compat
  username: string;
  displayName: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  speaking: boolean;
}

interface VoiceState {
  isConnected: boolean;
  currentChannelId: string | null;
  channelUsers: VoiceUser[];
  selfMute: boolean;
  selfDeaf: boolean;
  isSpeaking: boolean;
  inputDevice: string | null;
  outputDevice: string | null;
  inputVolume: number;
  outputVolume: number;
  voiceActivityThreshold: number;
  pushToTalk: boolean;
  pushToTalkKey: string;
  
  // Host management
  hostUserId: string | null;
  isHost: boolean;
  connectionQualities: Record<string, number>;
  
  // Actions
  setConnected: (connected: boolean, channelId?: string | null) => void;
  setChannelUsers: (users: VoiceUser[]) => void;
  addChannelUser: (user: VoiceUser) => void;
  removeChannelUser: (oderId: string) => void;
  updateUserVoiceState: (oderId: string, updates: Partial<VoiceUser>) => void;
  setSelfMute: (muted: boolean) => void;
  setSelfDeaf: (deaf: boolean) => void;
  setIsSpeaking: (speaking: boolean) => void;
  setInputDevice: (deviceId: string | null) => void;
  setOutputDevice: (deviceId: string | null) => void;
  setInputVolume: (volume: number) => void;
  setOutputVolume: (volume: number) => void;
  setVoiceActivityThreshold: (threshold: number) => void;
  setPushToTalk: (enabled: boolean) => void;
  setPushToTalkKey: (key: string) => void;
  setHost: (hostUserId: string | null) => void;
  setIsHost: (isHost: boolean) => void;
  updateConnectionQuality: (userId: string, quality: number) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  isConnected: false,
  currentChannelId: null,
  channelUsers: [],
  selfMute: false,
  selfDeaf: false,
  isSpeaking: false,
  inputDevice: null,
  outputDevice: null,
  inputVolume: 100,
  outputVolume: 100,
  voiceActivityThreshold: 50,
  pushToTalk: false,
  pushToTalkKey: 'Space',
  
  hostUserId: null,
  isHost: false,
  connectionQualities: {},
  
  setConnected: (connected, channelId = null) => set({
    isConnected: connected,
    currentChannelId: connected ? channelId : null,
    channelUsers: connected ? [] : [],
  }),
  
  setChannelUsers: (users) => set({ channelUsers: users }),
  
  addChannelUser: (user) => set((state) => ({
    channelUsers: [...state.channelUsers.filter((u) => u.oderId !== user.oderId), user],
  })),
  
  removeChannelUser: (oderId) => set((state) => ({
    channelUsers: state.channelUsers.filter((u) => u.oderId !== oderId),
  })),
  
  updateUserVoiceState: (oderId, updates) => set((state) => ({
    channelUsers: state.channelUsers.map((u) =>
      u.oderId === oderId ? { ...u, ...updates } : u
    ),
  })),
  
  setSelfMute: (muted) => set({ selfMute: muted }),
  setSelfDeaf: (deaf) => set({ selfDeaf: deaf, selfMute: deaf ? true : undefined }),
  setIsSpeaking: (speaking) => set({ isSpeaking: speaking }),
  setInputDevice: (deviceId) => set({ inputDevice: deviceId }),
  setOutputDevice: (deviceId) => set({ outputDevice: deviceId }),
  setInputVolume: (volume) => set({ inputVolume: volume }),
  setOutputVolume: (volume) => set({ outputVolume: volume }),
  setVoiceActivityThreshold: (threshold) => set({ voiceActivityThreshold: threshold }),
  setPushToTalk: (enabled) => set({ pushToTalk: enabled }),
  setPushToTalkKey: (key) => set({ pushToTalkKey: key }),
  
  setHost: (hostUserId) => set({ hostUserId }),
  setIsHost: (isHost) => set({ isHost }),
  updateConnectionQuality: (userId, quality) => set((state) => ({
    connectionQualities: { ...state.connectionQualities, [userId]: quality }
  })),
  
  reset: () => set({
    isConnected: false,
    currentChannelId: null,
    channelUsers: [],
    selfMute: false,
    selfDeaf: false,
    isSpeaking: false,
    hostUserId: null,
    isHost: false,
    connectionQualities: {},
  }),
}));
