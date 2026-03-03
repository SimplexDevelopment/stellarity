/**
 * Panel API Client
 *
 * Fetch-based client for the panel management API.
 * Mirrors the admin panel's AdminApiClient pattern.
 */

interface RequestOptions extends RequestInit {
  token?: string;
}

class PanelApiClient {
  private baseUrl: string;
  private getToken: () => string | null;

  constructor() {
    // In production, the panel API is served from the same origin
    this.baseUrl = '';
    this.getToken = () => null;
  }

  setTokenGetter(getter: () => string | null): void {
    this.getToken = getter;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { token, ...fetchOptions } = options;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string> || {}),
    };

    const authToken = token || this.getToken();
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    if (response.status === 401) {
      // Session expired
      const { usePanelAuthStore } = await import('../stores/panelAuthStore');
      usePanelAuthStore.getState().clearAuth();
      throw new Error('Session expired');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    return data;
  }

  // ── Auth ──────────────────────────────────────────────

  auth = {
    status: () =>
      this.request<{ needsSetup: boolean }>('/panel/api/auth/status'),

    setup: (passphrase: string) =>
      this.request<{ token: string; message: string }>('/panel/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ passphrase }),
      }),

    login: (passphrase: string) =>
      this.request<{ token: string }>('/panel/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ passphrase }),
      }),

    verify: () =>
      this.request<{ valid: boolean }>('/panel/api/auth/verify'),

    changePassphrase: (currentPassphrase: string, newPassphrase: string) =>
      this.request<{ token: string; message: string }>('/panel/api/auth/change-passphrase', {
        method: 'POST',
        body: JSON.stringify({ currentPassphrase, newPassphrase }),
      }),
  };

  // ── Settings ──────────────────────────────────────────

  settings = {
    get: () =>
      this.request<{ settings: any }>('/panel/api/settings'),

    update: (settings: Record<string, any>) =>
      this.request<{ settings: any; changes: string[] }>('/panel/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),

    getServerCreators: () =>
      this.request<{ creators: Array<{ user_id: string; username: string; display_name: string | null; added_at: string }> }>(
        '/panel/api/settings/server-creators'
      ),

    addServerCreator: (userId: string) =>
      this.request<{ success: boolean }>('/panel/api/settings/server-creators', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),

    removeServerCreator: (userId: string) =>
      this.request<{ success: boolean }>(`/panel/api/settings/server-creators/${userId}`, {
        method: 'DELETE',
      }),

    // ── Server Features ──
    getServerFeatures: () =>
      this.request<{
        features: Array<{
          serverId: string; serverName: string | null;
          buildALobbyEnabled: boolean; buildALobbyPosition: number;
          autoOverflowEnabled: boolean; updatedAt: string;
        }>;
      }>('/panel/api/settings/server-features'),

    updateServerFeatures: (serverId: string, data: {
      buildALobbyEnabled?: boolean;
      buildALobbyPosition?: number;
      autoOverflowEnabled?: boolean;
    }) =>
      this.request<{ success: boolean }>(`/panel/api/settings/server-features/${serverId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    resetServerFeatures: (serverId: string) =>
      this.request<{ success: boolean }>(`/panel/api/settings/server-features/${serverId}`, {
        method: 'DELETE',
      }),

    // ── Raw Settings ──
    getRawSettings: () =>
      this.request<{
        settings: Array<{ key: string; value: string; updatedAt: string }>;
      }>('/panel/api/settings/raw'),

    upsertRawSetting: (key: string, value: string) =>
      this.request<{ success: boolean }>('/panel/api/settings/raw', {
        method: 'PUT',
        body: JSON.stringify({ key, value }),
      }),

    deleteRawSetting: (key: string) =>
      this.request<{ success: boolean }>(`/panel/api/settings/raw/${key}`, {
        method: 'DELETE',
      }),
  };

  // ── Servers ───────────────────────────────────────────

  servers = {
    list: (params?: { page?: number; limit?: number; search?: string }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.search) qs.set('search', params.search);
      return this.request<{ servers: any[]; pagination: any }>(
        `/panel/api/servers?${qs.toString()}`
      );
    },

    get: (id: string) =>
      this.request<{ server: any; channels: any[]; members: any[]; roles: any[]; recentModeration: any[] }>(
        `/panel/api/servers/${id}`
      ),

    delete: (id: string) =>
      this.request<{ success: boolean; message: string }>(`/panel/api/servers/${id}`, {
        method: 'DELETE',
      }),

    transferOwnership: (id: string, newOwnerId: string) =>
      this.request<{ success: boolean; message: string }>(`/panel/api/servers/${id}/owner`, {
        method: 'PUT',
        body: JSON.stringify({ newOwnerId }),
      }),

    create: (data: { name: string; description?: string; ownerId: string; maxMembers?: number }) =>
      this.request<{ success: boolean; serverId: string; inviteCode: string }>('/panel/api/servers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: { name?: string; description?: string; maxMembers?: number }) =>
      this.request<{ success: boolean; message: string; changes: string[] }>(`/panel/api/servers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    regenerateInvite: (id: string) =>
      this.request<{ success: boolean; inviteCode: string }>(`/panel/api/servers/${id}/regenerate-invite`, {
        method: 'POST',
      }),

    // ── Categories (sub-resource) ──
    createCategory: (serverId: string, data: { name: string; position?: number }) =>
      this.request<{ success: boolean; categoryId: string }>(`/panel/api/servers/${serverId}/categories`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    updateCategory: (serverId: string, catId: string, data: { name?: string; position?: number }) =>
      this.request<{ success: boolean }>(`/panel/api/servers/${serverId}/categories/${catId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    deleteCategory: (serverId: string, catId: string) =>
      this.request<{ success: boolean; message: string }>(`/panel/api/servers/${serverId}/categories/${catId}`, {
        method: 'DELETE',
      }),

    // ── Channels (sub-resource) ──
    createChannel: (serverId: string, data: { name: string; type?: string; description?: string; categoryId?: string; position?: number; bitrate?: number; userLimit?: number }) =>
      this.request<{ success: boolean; channelId: string }>(`/panel/api/servers/${serverId}/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    updateChannel: (serverId: string, chId: string, data: { name?: string; description?: string; categoryId?: string; position?: number; bitrate?: number; userLimit?: number }) =>
      this.request<{ success: boolean }>(`/panel/api/servers/${serverId}/channels/${chId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    deleteChannel: (serverId: string, chId: string) =>
      this.request<{ success: boolean; message: string }>(`/panel/api/servers/${serverId}/channels/${chId}`, {
        method: 'DELETE',
      }),

    // ── Roles (sub-resource) ──
    createRole: (serverId: string, data: { name: string; color?: string; position?: number; permissions?: Record<string, boolean> }) =>
      this.request<{ success: boolean; roleId: string }>(`/panel/api/servers/${serverId}/roles`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    updateRole: (serverId: string, roleId: string, data: { name?: string; color?: string; position?: number; permissions?: Record<string, boolean> }) =>
      this.request<{ success: boolean }>(`/panel/api/servers/${serverId}/roles/${roleId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    deleteRole: (serverId: string, roleId: string) =>
      this.request<{ success: boolean; message: string }>(`/panel/api/servers/${serverId}/roles/${roleId}`, {
        method: 'DELETE',
      }),
  };

  // ── Members ───────────────────────────────────────────

  members = {
    list: (params?: { page?: number; limit?: number; search?: string; filter?: string }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.search) qs.set('search', params.search);
      if (params?.filter) qs.set('filter', params.filter);
      return this.request<{ members: any[]; pagination: any }>(
        `/panel/api/members?${qs.toString()}`
      );
    },

    get: (userId: string) =>
      this.request<{ member: any; servers: any[]; moderationHistory: any[]; roles: any[] }>(
        `/panel/api/members/${userId}`
      ),

    ban: (userId: string, reason?: string) =>
      this.request<{ success: boolean; message: string }>(`/panel/api/members/${userId}/ban`, {
        method: 'PUT',
        body: JSON.stringify({ reason }),
      }),

    unban: (userId: string) =>
      this.request<{ success: boolean; message: string }>(`/panel/api/members/${userId}/unban`, {
        method: 'PUT',
      }),

    remove: (userId: string) =>
      this.request<{ success: boolean; message: string }>(`/panel/api/members/${userId}`, {
        method: 'DELETE',
      }),

    updateNotes: (userId: string, notes: string) =>
      this.request<{ success: boolean }>(`/panel/api/members/${userId}/notes`, {
        method: 'PUT',
        body: JSON.stringify({ notes }),
      }),
  };

  // ── Moderation ────────────────────────────────────────

  moderation = {
    actions: (params?: { page?: number; limit?: number; serverId?: string; action?: string; active?: boolean }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.serverId) qs.set('serverId', params.serverId);
      if (params?.action) qs.set('action', params.action);
      if (params?.active) qs.set('active', 'true');
      return this.request<{ actions: any[]; pagination: any }>(
        `/panel/api/moderation/actions?${qs.toString()}`
      );
    },

    banned: () =>
      this.request<{ instanceBans: any[]; serverBans: any[] }>('/panel/api/moderation/banned'),

    revoke: (actionId: string) =>
      this.request<{ success: boolean; message: string }>(`/panel/api/moderation/actions/${actionId}/revoke`, {
        method: 'PUT',
      }),
  };

  // ── Metrics ───────────────────────────────────────────

  metrics = {
    get: () =>
      this.request<any>('/panel/api/metrics'),
  };

  // ── Audit Logs ────────────────────────────────────────

  auditLogs = {
    list: (params?: { page?: number; limit?: number; action?: string; userId?: string; targetType?: string; startDate?: string; endDate?: string }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.action) qs.set('action', params.action);
      if (params?.userId) qs.set('userId', params.userId);
      if (params?.targetType) qs.set('targetType', params.targetType);
      if (params?.startDate) qs.set('startDate', params.startDate);
      if (params?.endDate) qs.set('endDate', params.endDate);
      return this.request<{ logs: any[]; actionTypes: string[]; pagination: any }>(
        `/panel/api/audit-logs?${qs.toString()}`
      );
    },
  };

  // ── Database Browser ──────────────────────────────────

  database = {
    getTables: () =>
      this.request<{ tables: Array<{ name: string; rowCount: number; readOnly: boolean }> }>(
        '/panel/api/database'
      ),

    getSchema: (table: string) =>
      this.request<{
        table: string;
        columns: Array<{ name: string; type: string; pk: boolean; notnull: boolean; dflt_value: string | null }>;
        primaryKeys: string[];
        readOnly: boolean;
      }>(`/panel/api/database/${table}/schema`),

    getRows: (table: string, params?: { page?: number; limit?: number; search?: string; sort?: string; order?: 'ASC' | 'DESC' }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.search) qs.set('search', params.search);
      if (params?.sort) qs.set('sort', params.sort);
      if (params?.order) qs.set('order', params.order);
      return this.request<{
        table: string;
        columns: string[];
        rows: any[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/panel/api/database/${table}/rows?${qs.toString()}`);
    },

    insertRow: (table: string, data: Record<string, any>) =>
      this.request<{ success: boolean; row: any }>(`/panel/api/database/${table}/rows`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    updateRow: (table: string, id: string, data: Record<string, any>) =>
      this.request<{ success: boolean; row: any }>(`/panel/api/database/${table}/rows/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    deleteRow: (table: string, id: string) =>
      this.request<{ success: boolean; message: string }>(`/panel/api/database/${table}/rows/${id}`, {
        method: 'DELETE',
      }),
  };
}

export const panelApi = new PanelApiClient();
