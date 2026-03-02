/**
 * Admin Auth Store
 * 
 * Manages admin authentication state with persistence.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: 'superadmin' | 'admin';
  mfaEnabled: boolean;
}

interface AdminAuthState {
  admin: AdminUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // MFA flow
  mfaRequired: boolean;
  mfaToken: string | null;

  // Actions
  setAdmin: (admin: AdminUser | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setMfaRequired: (required: boolean, token?: string) => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      admin: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      mfaRequired: false,
      mfaToken: null,

      setAdmin: (admin) => set({
        admin,
        isAuthenticated: !!admin,
      }),

      setTokens: (accessToken, refreshToken) => set({
        accessToken,
        refreshToken,
        isAuthenticated: true,
      }),

      clearAuth: () => set({
        admin: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        error: null,
        mfaRequired: false,
        mfaToken: null,
      }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      setMfaRequired: (required, token) => set({
        mfaRequired: required,
        mfaToken: token || null,
      }),
    }),
    {
      name: 'stellarity-admin-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        admin: state.admin,
      }),
    }
  )
);
