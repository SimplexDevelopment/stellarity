/**
 * Central API Client
 * 
 * Communicates with the centralized Stellarity server for:
 * - Authentication (register, login, MFA, tokens)
 * - Discovery (browse/search instances)
 * - DM buffering (offline message relay)
 * - Subscription management
 * - User profile
 */

const CENTRAL_URL = import.meta.env.VITE_CENTRAL_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
  token?: string;
}

class CentralApiClient {
  private baseUrl: string;
  private getToken: () => string | null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.getToken = () => null;
  }

  setTokenGetter(getter: () => string | null) {
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

  // ── Auth Endpoints ────────────────────────────────────────────────

  auth = {
    register: (data: { username: string; email: string; password: string; displayName?: string }) =>
      this.request<{
        user: any;
        accessToken: string;
        refreshToken: string;
        accessTokenExpiry: number;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    login: (data: { login: string; password: string }) =>
      this.request<{
        user?: any;
        accessToken?: string;
        refreshToken?: string;
        accessTokenExpiry?: number;
        mfaRequired?: boolean;
        mfaToken?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    refresh: (refreshToken: string) =>
      this.request<{
        accessToken: string;
        refreshToken: string;
        accessTokenExpiry: number;
      }>('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),

    logout: (refreshToken?: string) =>
      this.request('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),

    me: () => this.request<{ user: any }>('/api/auth/me'),

    updateProfile: (data: { displayName?: string; avatarUrl?: string | null; statusMessage?: string }) =>
      this.request<{ user: any }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    publicKey: () =>
      this.request<{ publicKey: string; algorithm: string }>('/api/auth/public-key'),

    setupMFA: () =>
      this.request<{ qrCodeUrl: string; secret: string }>('/api/auth/mfa/setup', {
        method: 'POST',
      }),

    verifyMFA: (token: string) =>
      this.request<{ enabled: boolean; backupCodes?: string[] }>('/api/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),

    verifyMFALogin: (mfaToken: string, code: string) =>
      this.request<{
        user: any;
        accessToken: string;
        refreshToken: string;
        accessTokenExpiry: number;
      }>('/api/auth/mfa/login', {
        method: 'POST',
        body: JSON.stringify({ mfaToken, code }),
      }),

    disableMFA: (token: string) =>
      this.request('/api/auth/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
  };

  // ── Discovery Endpoints ───────────────────────────────────────────

  discovery = {
    search: (params?: {
      search?: string;
      tags?: string[];
      category?: string;
      region?: string;
      sort?: string;
      page?: number;
      limit?: number;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.tags) params.tags.forEach(t => searchParams.append('tags', t));
      if (params?.category) searchParams.set('category', params.category);
      if (params?.region) searchParams.set('region', params.region);
      if (params?.sort) searchParams.set('sort', params.sort);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      const qs = searchParams.toString();
      return this.request<any>(`/api/discovery${qs ? `?${qs}` : ''}`);
    },

    get: (instanceId: string) =>
      this.request<any>(`/api/discovery/${instanceId}`),

    register: (data: {
      instanceName: string;
      description?: string | null;
      url: string;
      publicKey: string;
      tags?: string[];
      region?: string | null;
      iconUrl?: string | null;
      maxMembers?: number;
    }) =>
      this.request<{ instanceId: string }>('/api/discovery/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    mine: () => this.request<{ instances: any[] }>('/api/discovery/mine'),

    remove: (instanceId: string) =>
      this.request('/api/discovery/' + instanceId, { method: 'DELETE' }),
  };

  // ── DM Endpoints ──────────────────────────────────────────────────

  dm = {
    send: (data: { recipientId: string; content: string; encrypted?: boolean }) =>
      this.request<{ messageId: string; conversationId: string; status: string }>('/api/dm/send', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getPending: () =>
      this.request<{ messages: any[]; count: number }>('/api/dm/pending'),

    acknowledge: (messageIds: string[]) =>
      this.request<{ acknowledged: number }>('/api/dm/acknowledge', {
        method: 'POST',
        body: JSON.stringify({ messageIds }),
      }),

    getConversations: () =>
      this.request<{ conversations: any[] }>('/api/dm/conversations'),
  };

  // ── Subscription Endpoints ────────────────────────────────────────

  subscription = {
    get: () => this.request<any>('/api/subscription'),

    getTiers: () => this.request<any>('/api/subscription/tiers'),

    cancel: () =>
      this.request('/api/subscription/cancel', { method: 'POST' }),
  };

  // ── Health ────────────────────────────────────────────────────────

  health = () => this.request<any>('/health');
}

export const centralApi = new CentralApiClient(CENTRAL_URL);
