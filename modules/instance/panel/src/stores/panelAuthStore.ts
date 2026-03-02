import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PanelAuthState {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  setToken: (token: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const usePanelAuthStore = create<PanelAuthState>()(
  persist(
    (set) => ({
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setToken: (token) => set({ token, isAuthenticated: true, error: null }),
      clearAuth: () => set({ token: null, isAuthenticated: false, error: null }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'stellarity-panel-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
