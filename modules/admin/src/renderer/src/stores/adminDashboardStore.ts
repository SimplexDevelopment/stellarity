/**
 * Admin Dashboard Store
 * 
 * Caches and manages dashboard metrics data.
 */
import { create } from 'zustand';

interface DashboardMetrics {
  totalUsers: number;
  onlineUsers: number;
  totalInstances: number;
  verifiedInstances: number;
  dmBufferSize: number;
  pendingDMs: number;
  totalAdmins: number;
  recentRegistrations24h: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
}

interface RegistrationPoint {
  date: string;
  count: number;
}

interface DashboardState {
  metrics: DashboardMetrics | null;
  registrationHistory: RegistrationPoint[];
  isLoading: boolean;
  lastFetched: number | null;
  error: string | null;

  // Actions
  setMetrics: (metrics: DashboardMetrics) => void;
  setRegistrationHistory: (history: RegistrationPoint[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAdminDashboardStore = create<DashboardState>()((set) => ({
  metrics: null,
  registrationHistory: [],
  isLoading: false,
  lastFetched: null,
  error: null,

  setMetrics: (metrics) => set({ metrics, lastFetched: Date.now() }),
  setRegistrationHistory: (registrationHistory) => set({ registrationHistory }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
