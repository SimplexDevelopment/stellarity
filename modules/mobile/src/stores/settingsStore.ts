import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ProfileStyle = 'professional' | 'casual';

interface UserSettings {
  // Profile
  profileStyle: ProfileStyle;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accentColor: string;
  
  // Professional profile fields
  title: string;
  company: string;
  linkedIn: string;
  
  // Casual profile fields
  status: string;
  customStatus: string;
  
  // Voice settings
  inputDevice: string | null;
  outputDevice: string | null;
  inputVolume: number;
  outputVolume: number;
  voiceActivityThreshold: number;
  pushToTalk: boolean;
  pushToTalkKey: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  bitrate: number; // 128-512 kbps
  
  // Notification settings
  enableNotifications: boolean;
  notificationSound: boolean;
  notificationVolume: number;
  mutedServers: string[];
  mutedChannels: string[];
  
  // Appearance
  theme: 'clinical' | 'cyan-navy' | 'violet-nebula' | 'multi-zone';
  compactMode: boolean;
  fontSize: 'small' | 'medium' | 'large';
  showAvatars: boolean;
  animateEmoji: boolean;
  
  // Privacy
  showOnlineStatus: boolean;
  allowDirectMessages: boolean;
  allowFriendRequests: boolean;
  
  // Keybinds
  keybinds: Record<string, string>;
}

interface SettingsState extends UserSettings {
  // Actions
  setProfileStyle: (style: ProfileStyle) => void;
  setDisplayName: (name: string) => void;
  setBio: (bio: string) => void;
  setAvatarUrl: (url: string | null) => void;
  setBannerUrl: (url: string | null) => void;
  setAccentColor: (color: string) => void;
  
  setProfessionalProfile: (data: { title?: string; company?: string; linkedIn?: string }) => void;
  setCasualProfile: (data: { status?: string; customStatus?: string }) => void;
  
  setVoiceSettings: (settings: Partial<Pick<UserSettings, 
    'inputDevice' | 'outputDevice' | 'inputVolume' | 'outputVolume' | 
    'voiceActivityThreshold' | 'pushToTalk' | 'pushToTalkKey' | 
    'noiseSuppression' | 'echoCancellation' | 'autoGainControl' | 'bitrate'
  >>) => void;
  
  setNotificationSettings: (settings: Partial<Pick<UserSettings,
    'enableNotifications' | 'notificationSound' | 'notificationVolume'
  >>) => void;
  
  muteServer: (serverId: string) => void;
  unmuteServer: (serverId: string) => void;
  muteChannel: (channelId: string) => void;
  unmuteChannel: (channelId: string) => void;
  
  setAppearance: (settings: Partial<Pick<UserSettings,
    'theme' | 'compactMode' | 'fontSize' | 'showAvatars' | 'animateEmoji'
  >>) => void;
  
  setPrivacy: (settings: Partial<Pick<UserSettings,
    'showOnlineStatus' | 'allowDirectMessages' | 'allowFriendRequests'
  >>) => void;
  
  setKeybind: (action: string, key: string) => void;
  
  reset: () => void;
}

const defaultSettings: UserSettings = {
  profileStyle: 'casual',
  displayName: '',
  bio: '',
  avatarUrl: null,
  bannerUrl: null,
  accentColor: '#00d4aa',
  
  title: '',
  company: '',
  linkedIn: '',
  
  status: 'online',
  customStatus: '',
  
  inputDevice: null,
  outputDevice: null,
  inputVolume: 100,
  outputVolume: 100,
  voiceActivityThreshold: 50,
  pushToTalk: false,
  pushToTalkKey: 'Space',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  bitrate: 64, // 64kbps is optimal for voice
  
  enableNotifications: true,
  notificationSound: true,
  notificationVolume: 80,
  mutedServers: [],
  mutedChannels: [],
  
  theme: 'clinical',
  compactMode: false,
  fontSize: 'medium',
  showAvatars: true,
  animateEmoji: true,
  
  showOnlineStatus: true,
  allowDirectMessages: true,
  allowFriendRequests: true,
  
  keybinds: {
    pushToTalk: 'Space',
    toggleMute: 'Ctrl+Shift+m',
    toggleDeafen: 'Ctrl+Shift+d',
    disconnect: 'Ctrl+Shift+e',
    openSettings: 'Ctrl+,',
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      
      setProfileStyle: (style) => set({ profileStyle: style }),
      setDisplayName: (name) => set({ displayName: name }),
      setBio: (bio) => set({ bio: bio }),
      setAvatarUrl: (url) => set({ avatarUrl: url }),
      setBannerUrl: (url) => set({ bannerUrl: url }),
      setAccentColor: (color) => set({ accentColor: color }),
      
      setProfessionalProfile: (data) => set((state) => ({
        title: data.title ?? state.title,
        company: data.company ?? state.company,
        linkedIn: data.linkedIn ?? state.linkedIn,
      })),
      
      setCasualProfile: (data) => set((state) => ({
        status: data.status ?? state.status,
        customStatus: data.customStatus ?? state.customStatus,
      })),
      
      setVoiceSettings: (settings) => set((state) => ({ ...state, ...settings })),
      
      setNotificationSettings: (settings) => set((state) => ({ ...state, ...settings })),
      
      muteServer: (serverId) => set((state) => ({
        mutedServers: [...state.mutedServers, serverId],
      })),
      
      unmuteServer: (serverId) => set((state) => ({
        mutedServers: state.mutedServers.filter((id) => id !== serverId),
      })),
      
      muteChannel: (channelId) => set((state) => ({
        mutedChannels: [...state.mutedChannels, channelId],
      })),
      
      unmuteChannel: (channelId) => set((state) => ({
        mutedChannels: state.mutedChannels.filter((id) => id !== channelId),
      })),
      
      setAppearance: (settings) => set((state) => ({ ...state, ...settings })),
      
      setPrivacy: (settings) => set((state) => ({ ...state, ...settings })),
      
      setKeybind: (action, key) => set((state) => ({
        keybinds: { ...state.keybinds, [action]: key },
      })),
      
      reset: () => set(defaultSettings),
    }),
    {
      name: 'stellarity-settings',
    }
  )
);
