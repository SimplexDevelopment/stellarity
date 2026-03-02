/**
 * Admin API Client
 * 
 * Communicates with the central server admin endpoints at /api/admin/*
 */

const CENTRAL_URL = import.meta.env.VITE_CENTRAL_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
  token?: string;
}

class AdminApiClient {
  private baseUrl: string;
  private getToken: () => string | null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.getToken = () => null;
  }

  setTokenGetter(getter: () => string | null): void {
    this.getToken = getter;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { token, ...fetchOptions } = options;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    };

    const authToken = token || this.getToken();
    if (authToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  // ── Auth ──────────────────────────────────────────────────

  auth = {
    login: (data: { username: string; password: string }) =>
      this.request<{
        admin?: any;
        accessToken?: string;
        refreshToken?: string;
        mfaRequired?: boolean;
        mfaToken?: string;
      }>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    verifyMfa: (mfaToken: string, code: string) =>
      this.request<{
        admin: any;
        accessToken: string;
        refreshToken: string;
      }>('/api/admin/auth/mfa/login', {
        method: 'POST',
        body: JSON.stringify({ mfaToken, code }),
      }),

    refresh: (refreshToken: string) =>
      this.request<{
        accessToken: string;
        refreshToken: string;
      }>('/api/admin/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),

    logout: (refreshToken?: string) =>
      this.request('/api/admin/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),

    me: () =>
      this.request<{ admin: any }>('/api/admin/auth/me'),

    setupMfa: () =>
      this.request<{ qrCodeUrl: string; secret: string }>('/api/admin/auth/mfa/setup', {
        method: 'POST',
      }),

    verifyMfaSetup: (token: string) =>
      this.request<{ enabled: boolean; backupCodes?: string[] }>('/api/admin/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),

    disableMfa: (token: string) =>
      this.request('/api/admin/auth/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),

    changePassword: (currentPassword: string, newPassword: string) =>
      this.request('/api/admin/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
  };

  // ── Users ─────────────────────────────────────────────────

  users = {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      tier?: string;
      status?: string;
      suspended?: string;
      sort?: string;
      order?: string;
    }) => {
      const sp = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== '') sp.set(k, String(v));
        });
      }
      const qs = sp.toString();
      return this.request<{ users: any[]; total: number; page: number; limit: number }>(
        `/api/admin/users${qs ? `?${qs}` : ''}`
      );
    },

    get: (userId: string) =>
      this.request<{ user: any }>(`/api/admin/users/${userId}`),

    update: (userId: string, data: any) =>
      this.request<{ user: any }>(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    suspend: (userId: string, reason: string) =>
      this.request(`/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),

    unsuspend: (userId: string) =>
      this.request(`/api/admin/users/${userId}/unsuspend`, {
        method: 'POST',
      }),

    resetMfa: (userId: string) =>
      this.request(`/api/admin/users/${userId}/reset-mfa`, {
        method: 'POST',
      }),

    delete: (userId: string) =>
      this.request(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      }),
  };

  // ── Instances ─────────────────────────────────────────────

  instances = {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      isPublic?: string;
      isVerified?: string;
      stale?: string;
      sort?: string;
      order?: string;
    }) => {
      const sp = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== '') sp.set(k, String(v));
        });
      }
      const qs = sp.toString();
      return this.request<{ instances: any[]; total: number; page: number; limit: number }>(
        `/api/admin/instances${qs ? `?${qs}` : ''}`
      );
    },

    get: (instanceId: string) =>
      this.request<{ instance: any }>(`/api/admin/instances/${instanceId}`),

    verify: (instanceId: string) =>
      this.request(`/api/admin/instances/${instanceId}/verify`, {
        method: 'POST',
      }),

    unverify: (instanceId: string) =>
      this.request(`/api/admin/instances/${instanceId}/unverify`, {
        method: 'POST',
      }),

    remove: (instanceId: string) =>
      this.request(`/api/admin/instances/${instanceId}`, {
        method: 'DELETE',
      }),
  };

  // ── Audit Logs ────────────────────────────────────────────

  auditLogs = {
    list: (params?: {
      page?: number;
      limit?: number;
      userId?: string;
      action?: string;
      actorType?: string;
      targetType?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      const sp = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== '') sp.set(k, String(v));
        });
      }
      const qs = sp.toString();
      return this.request<{ logs: any[]; total: number; page: number; limit: number }>(
        `/api/admin/audit-logs${qs ? `?${qs}` : ''}`
      );
    },

    stats: () =>
      this.request<{ stats: any }>('/api/admin/audit-logs/stats'),
  };

  // ── Subscriptions ─────────────────────────────────────────

  subscriptions = {
    list: (params?: {
      page?: number;
      limit?: number;
      tier?: string;
      status?: string;
      sort?: string;
      order?: string;
    }) => {
      const sp = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== '') sp.set(k, String(v));
        });
      }
      const qs = sp.toString();
      return this.request<{ subscriptions: any[]; total: number; page: number; limit: number }>(
        `/api/admin/subscriptions${qs ? `?${qs}` : ''}`
      );
    },

    overrideTier: (userId: string, tier: string, expiresAt?: string) =>
      this.request(`/api/admin/subscriptions/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ tier, expiresAt }),
      }),

    stats: () =>
      this.request<any>('/api/admin/subscriptions/stats'),
  };

  // ── Metrics ───────────────────────────────────────────────

  metrics = {
    dashboard: () =>
      this.request<{ metrics: any }>('/api/admin/metrics'),

    registrations: (days?: number) => {
      const qs = days ? `?days=${days}` : '';
      return this.request<{ history: any[] }>(`/api/admin/metrics/registrations${qs}`);
    },

    dmBuffer: () =>
      this.request<{ stats: any }>('/api/admin/metrics/dm-buffer'),

    purgeDmBuffer: (conversationId: string) =>
      this.request(`/api/admin/metrics/dm-buffer/${conversationId}`, {
        method: 'DELETE',
      }),

    purgeExpiredDmBuffers: () =>
      this.request('/api/admin/metrics/dm-buffer/purge-expired', {
        method: 'POST',
      }),
  };

  // ── Admin Accounts ────────────────────────────────────────

  admins = {
    list: () =>
      this.request<{ admins: any[] }>('/api/admin/admins'),

    create: (data: { username: string; password: string; role?: string; displayName?: string }) =>
      this.request<{ admin: any }>('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    remove: (adminId: string) =>
      this.request(`/api/admin/admins/${adminId}`, {
        method: 'DELETE',
      }),

    updateRole: (adminId: string, role: string) =>
      this.request(`/api/admin/admins/${adminId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
  };
}

export const adminApi = new AdminApiClient(CENTRAL_URL);
