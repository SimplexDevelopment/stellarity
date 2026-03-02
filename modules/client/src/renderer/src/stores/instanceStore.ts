/**
 * Instance Store
 * 
 * Tracks which instance servers are connected and their status.
 * Persists saved instances so users can reconnect on app restart.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type InstanceOnlineStatus = 'online' | 'offline' | 'checking' | 'unknown';

interface SavedInstance {
  id: string;
  name: string;
  url: string;
  iconUrl: string | null;
  addedAt: string;
}

interface InstanceState {
  /** Instances the user has saved/bookmarked */
  savedInstances: SavedInstance[];
  
  /** Currently connected instance IDs */
  connectedInstanceIds: string[];
  
  /** Active instance in the sidebar */
  activeInstanceId: string | null;

  /** Online/offline status per instance */
  onlineStatus: Record<string, InstanceOnlineStatus>;
  
  // Actions
  saveInstance: (instance: SavedInstance) => void;
  removeInstance: (instanceId: string) => void;
  setConnected: (instanceId: string, connected: boolean) => void;
  setActiveInstance: (instanceId: string | null) => void;
  setOnlineStatus: (instanceId: string, status: InstanceOnlineStatus) => void;
  isInstanceOnline: (instanceId: string) => boolean;
  reset: () => void;
}

export const useInstanceStore = create<InstanceState>()(
  persist(
    (set, get) => ({
      savedInstances: [],
      connectedInstanceIds: [],
      activeInstanceId: null,
      onlineStatus: {},

      saveInstance: (instance) => set((state) => ({
        savedInstances: [
          ...state.savedInstances.filter(i => i.id !== instance.id),
          instance,
        ],
      })),

      removeInstance: (instanceId) => set((state) => {
        const { [instanceId]: _, ...restStatus } = state.onlineStatus;
        return {
          savedInstances: state.savedInstances.filter(i => i.id !== instanceId),
          connectedInstanceIds: state.connectedInstanceIds.filter(id => id !== instanceId),
          activeInstanceId: state.activeInstanceId === instanceId ? null : state.activeInstanceId,
          onlineStatus: restStatus,
        };
      }),

      setConnected: (instanceId, connected) => set((state) => ({
        connectedInstanceIds: connected
          ? [...new Set([...state.connectedInstanceIds, instanceId])]
          : state.connectedInstanceIds.filter(id => id !== instanceId),
      })),

      setActiveInstance: (instanceId) => set({ activeInstanceId: instanceId }),

      setOnlineStatus: (instanceId, status) => set((state) => ({
        onlineStatus: { ...state.onlineStatus, [instanceId]: status },
      })),

      isInstanceOnline: (instanceId) => {
        return get().onlineStatus[instanceId] === 'online';
      },

      reset: () => set({
        connectedInstanceIds: [],
        activeInstanceId: null,
        onlineStatus: {},
      }),
    }),
    {
      name: 'stellarity-instances',
      partialize: (state) => ({
        savedInstances: state.savedInstances,
      }),
    }
  )
);
