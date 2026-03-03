/**
 * Instance API Client
 * 
 * Communicates with individual instance servers for:
 * - Server/community management
 * - Channels
 * - Messages
 * - Voice (signaling via socket)
 * 
 * One InstanceApiClient is created per connected instance.
 * Authentication uses the centrally-issued JWT.
 */

interface RequestOptions extends RequestInit {
  token?: string;
}

export class InstanceApiClient {
  private baseUrl: string;
  private getToken: () => string | null;
  public readonly instanceId: string;
  public readonly instanceUrl: string;

  constructor(instanceUrl: string, instanceId: string) {
    this.baseUrl = instanceUrl.replace(/\/$/, '');
    this.instanceUrl = instanceUrl;
    this.instanceId = instanceId;
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

  // ── Instance Info ─────────────────────────────────────────────────

  instance = {
    /** Get instance public info */
    info: () => this.request<any>('/api/instance/info'),

    /** Connect to this instance (registers you as a member) */
    connect: () => this.request<any>('/api/instance/connect', { method: 'POST' }),

    /** Get your member profile on this instance */
    me: () => this.request<any>('/api/instance/me'),
  };

  // ── Server Endpoints ──────────────────────────────────────────────

  servers = {
    /** List user's joined servers */
    list: () => this.request<{ servers: any[] }>('/api/servers'),

    /** Browse all available servers (public + joined) */
    browse: () => this.request<{ servers: any[] }>('/api/servers/browse'),

    /** Check if user can create servers (instance policy) */
    canCreate: () => this.request<{ canCreate: boolean }>('/api/servers/policy/can-create'),

    get: (serverId: string) => this.request<{ server: any }>(`/api/servers/${serverId}`),

    create: (data: { name: string; description?: string; isPublic?: boolean; password?: string }) =>
      this.request<{ server: any }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (serverId: string, data: { name?: string; description?: string; iconUrl?: string; isPublic?: boolean; password?: string; removePassword?: boolean }) =>
      this.request<{ server: any }>(`/api/servers/${serverId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    /** Join via invite code */
    join: (inviteCode: string) =>
      this.request<{ server: any }>(`/api/servers/join/${inviteCode}`, {
        method: 'POST',
      }),

    /** Join a public server (with optional password) */
    joinPublic: (serverId: string, password?: string) =>
      this.request<{ server: any }>(`/api/servers/${serverId}/join`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),

    leave: (serverId: string) =>
      this.request(`/api/servers/${serverId}/leave`, { method: 'POST' }),

    delete: (serverId: string) =>
      this.request(`/api/servers/${serverId}`, { method: 'DELETE' }),

    getMembers: (serverId: string) =>
      this.request<{ members: any[] }>(`/api/servers/${serverId}/members`),

    regenerateInvite: (serverId: string) =>
      this.request<{ inviteCode: string }>(`/api/servers/${serverId}/invite`, {
        method: 'POST',
      }),

    /** Update a member's roles */
    setMemberRoles: (serverId: string, userId: string, roleIds: string[]) =>
      this.request<{ roleIds: string[] }>(`/api/servers/${serverId}/members/${userId}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roleIds }),
      }),
  };

  // ── Channel Endpoints ─────────────────────────────────────────────

  channels = {
    list: (serverId: string) =>
      this.request<{ channels: any[] }>(`/api/servers/${serverId}/channels`),

    create: (serverId: string, data: { name: string; type: 'text' | 'voice'; description?: string; categoryId?: string; userLimit?: number; bitrate?: number }) =>
      this.request<{ channel: any }>(`/api/servers/${serverId}/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (serverId: string, channelId: string, data: { name?: string; description?: string; categoryId?: string | null; position?: number }) =>
      this.request<{ channel: any }>(`/api/servers/${serverId}/channels/${channelId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (serverId: string, channelId: string) =>
      this.request(`/api/servers/${serverId}/channels/${channelId}`, { method: 'DELETE' }),
  };

  // ── Category Endpoints ────────────────────────────────────────────

  categories = {
    list: (serverId: string) =>
      this.request<{ categories: any[] }>(`/api/servers/${serverId}/categories`),

    create: (serverId: string, data: { name: string; position?: number }) =>
      this.request<{ category: any }>(`/api/servers/${serverId}/categories`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (serverId: string, categoryId: string, data: { name?: string; position?: number }) =>
      this.request<{ category: any }>(`/api/servers/${serverId}/categories/${categoryId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (serverId: string, categoryId: string) =>
      this.request(`/api/servers/${serverId}/categories/${categoryId}`, { method: 'DELETE' }),
  };

  // ── Role Endpoints ────────────────────────────────────────────────

  roles = {
    list: (serverId: string) =>
      this.request<{ roles: any[] }>(`/api/servers/${serverId}/roles`),

    create: (serverId: string, data: { name: string; color?: string; permissions?: Record<string, boolean> }) =>
      this.request<{ role: any }>(`/api/servers/${serverId}/roles`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (serverId: string, roleId: string, data: { name?: string; color?: string; position?: number; permissions?: Record<string, boolean> }) =>
      this.request<{ role: any }>(`/api/servers/${serverId}/roles/${roleId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (serverId: string, roleId: string) =>
      this.request(`/api/servers/${serverId}/roles/${roleId}`, { method: 'DELETE' }),
  };

  // ── Message Endpoints ─────────────────────────────────────────────

  messages = {
    get: (channelId: string, options?: { limit?: number; before?: string; after?: string }) => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.before) params.set('before', options.before);
      if (options?.after) params.set('after', options.after);
      const query = params.toString();
      return this.request<any[]>(`/api/channels/${channelId}/messages${query ? `?${query}` : ''}`);
    },

    send: (channelId: string, data: { content: string; encrypted?: boolean; replyToId?: string }) =>
      this.request<any>(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    edit: (channelId: string, messageId: string, content: string) =>
      this.request<any>(`/api/channels/${channelId}/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),

    delete: (channelId: string, messageId: string) =>
      this.request(`/api/channels/${channelId}/messages/${messageId}`, {
        method: 'DELETE',
      }),

    search: (channelId: string, query: string) =>
      this.request<any[]>(`/api/channels/${channelId}/messages/search?q=${encodeURIComponent(query)}`),

    getPinned: (channelId: string) =>
      this.request<any[]>(`/api/channels/${channelId}/pins`),

    pin: (channelId: string, messageId: string) =>
      this.request(`/api/channels/${channelId}/pins/${messageId}`, { method: 'PUT' }),

    unpin: (channelId: string, messageId: string) =>
      this.request(`/api/channels/${channelId}/pins/${messageId}`, { method: 'DELETE' }),
  };

  // ── Lobby Endpoints ──────────────────────────────────────────────

  lobbies = {
    create: (serverId: string, data: { name: string; userLimit?: number; password?: string }) =>
      this.request<{ channel: any }>(`/api/servers/${serverId}/lobbies`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (serverId: string, channelId: string, data: { name?: string; bitrate?: number; userLimit?: number; password?: string; removePassword?: boolean }) =>
      this.request<{ channel: any }>(`/api/servers/${serverId}/lobbies/${channelId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    delete: (serverId: string, channelId: string) =>
      this.request(`/api/servers/${serverId}/lobbies/${channelId}`, { method: 'DELETE' }),

    verifyPassword: (serverId: string, channelId: string, password: string) =>
      this.request<{ success: boolean }>(`/api/servers/${serverId}/lobbies/${channelId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
  };

  // ── Voice Occupancy ──────────────────────────────────────────────

  voiceOccupancy = {
    get: (serverId: string) =>
      this.request<{ channels: { channelId: string; users: any[] }[] }>(`/api/servers/${serverId}/voice-occupancy`),
  };

  // ── Server Features ──────────────────────────────────────────────

  features = {
    get: (serverId: string) =>
      this.request<{ features: any }>(`/api/servers/${serverId}/features`),

    update: (serverId: string, data: { buildALobbyEnabled?: boolean; buildALobbyPosition?: number; autoOverflowEnabled?: boolean }) =>
      this.request<{ features: any }>(`/api/servers/${serverId}/features`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  };

  // ── Health ────────────────────────────────────────────────────────

  health = () => this.request<any>('/health');
}
