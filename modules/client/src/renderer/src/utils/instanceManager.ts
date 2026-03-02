/**
 * Instance Manager
 * 
 * Manages connections to multiple instance servers simultaneously.
 * Each instance gets its own API client + socket pair.
 * The user's centrally-issued JWT is used to authenticate with all instances.
 * 
 * Supports connections via:
 * - Named URLs (https://instance.example.com)
 * - IP addresses (192.168.1.10, 192.168.1.10:4150)
 * - Localhost (localhost, 127.0.0.1)
 * 
 * Periodically checks instance health and marks offline instances
 * as unavailable in the UI.
 */
import { InstanceApiClient } from './instanceApi';
import { InstanceSocketManager, InstanceSocketCallbacks } from './instanceSocket';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';
import { useVoiceStore } from '../stores/voiceStore';
import { useMessageStore, Message } from '../stores/messageStore';
import { useInstanceStore, InstanceOnlineStatus } from '../stores/instanceStore';

export interface InstanceConnection {
  id: string;
  name: string;
  url: string;
  api: InstanceApiClient;
  socket: InstanceSocketManager;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
}

/** Health check interval — 30 seconds */
const HEALTH_CHECK_INTERVAL = 30_000;
/** Health check request timeout — 5 seconds */
const HEALTH_CHECK_TIMEOUT = 5_000;

/** Default port for instance servers */
const INSTANCE_DEFAULT_PORT = 4150;

/**
 * Normalize a user-entered instance address into a full URL.
 * 
 * Accepts:
 * - Full URLs: https://instance.example.com, http://localhost:4150
 * - Hostnames: instance.example.com, instance.example.com:4150
 * - IP addresses: 192.168.1.10, 10.0.0.5:4150
 * - Localhost: localhost, 127.0.0.1
 * 
 * Port is optional — defaults to 4150 for local/IP addresses.
 */
export function normalizeInstanceUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');

  // If no protocol, add one
  if (!url.match(/^https?:\/\//i)) {
    // Use http for localhost/private IPs, https for everything else
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i.test(url);
    const protocol = isLocal ? 'http' : 'https';

    // If local/IP and no port specified, append default instance port
    if (isLocal && !url.match(/:\d+$/)) {
      url = `${protocol}://${url}:${INSTANCE_DEFAULT_PORT}`;
    } else {
      url = `${protocol}://${url}`;
    }
  } else {
    // Has protocol — check if it's a local URL without a port
    try {
      const parsed = new URL(url);
      const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i.test(parsed.hostname);
      if (isLocal && !parsed.port) {
        parsed.port = String(INSTANCE_DEFAULT_PORT);
        url = parsed.toString().replace(/\/+$/, '');
      }
    } catch {
      // Invalid URL — leave as-is
    }
  }

  return url;
}

class InstanceManager {
  private instances = new Map<string, InstanceConnection>();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  /** Connect to an instance server */
  async connect(instanceId: string, instanceUrl: string, instanceName: string): Promise<InstanceConnection> {
    // Don't duplicate connections
    const existing = this.instances.get(instanceId);
    if (existing && existing.status === 'connected') {
      return existing;
    }

    const token = useAuthStore.getState().accessToken;
    if (!token) {
      throw new Error('Not authenticated');
    }

    const normalizedUrl = normalizeInstanceUrl(instanceUrl);

    // Create API client
    const api = new InstanceApiClient(normalizedUrl, instanceId);
    api.setTokenGetter(() => useAuthStore.getState().accessToken);

    // Create socket manager
    const socket = new InstanceSocketManager(normalizedUrl, instanceId);

    const connection: InstanceConnection = {
      id: instanceId,
      name: instanceName,
      url: normalizedUrl,
      api,
      socket,
      status: 'connecting',
    };

    this.instances.set(instanceId, connection);

    try {
      // Register with instance (creates member record)
      await api.instance.connect();

      // Set up socket callbacks
      socket.setCallbacks(this.createCallbacks(instanceId));

      // Connect socket
      socket.connect(token);

      connection.status = 'connected';
      useInstanceStore.getState().setOnlineStatus(instanceId, 'online');

      // Load servers for this instance
      const result = await api.servers.list();
      if (result.servers) {
        const serversWithInstance = result.servers.map((s: any) => ({
          ...s,
          instanceId,
          instanceName,
        }));
        useServerStore.getState().addInstanceServers(instanceId, serversWithInstance);
      }

      // Start health checks if not already running
      this.startHealthChecks();

      return connection;
    } catch (error: any) {
      connection.status = 'error';
      connection.error = error.message;
      useInstanceStore.getState().setOnlineStatus(instanceId, 'offline');
      throw error;
    }
  }

  /** Disconnect from an instance */
  disconnect(instanceId: string): void {
    const conn = this.instances.get(instanceId);
    if (conn) {
      conn.socket.disconnect();
      conn.status = 'disconnected';
      useServerStore.getState().removeInstanceServers(instanceId);
      this.instances.delete(instanceId);
    }

    // Stop health checks if no more connections
    if (this.instances.size === 0) {
      this.stopHealthChecks();
    }
  }

  /** Disconnect from all instances */
  disconnectAll(): void {
    for (const [id] of this.instances) {
      this.disconnect(id);
    }
    this.stopHealthChecks();
  }

  /** Get a connected instance */
  getInstance(instanceId: string): InstanceConnection | undefined {
    return this.instances.get(instanceId);
  }

  /** Get all connected instances */
  getAllInstances(): InstanceConnection[] {
    return Array.from(this.instances.values());
  }

  /** Get the API client for a specific instance */
  getApi(instanceId: string): InstanceApiClient | undefined {
    return this.instances.get(instanceId)?.api;
  }

  /** Get the socket for a specific instance */
  getSocket(instanceId: string): InstanceSocketManager | undefined {
    return this.instances.get(instanceId)?.socket;
  }

  /** Find which instance a server belongs to */
  getInstanceForServer(serverId: string): InstanceConnection | undefined {
    const servers = useServerStore.getState().servers;
    const server = servers.find(s => s.id === serverId);
    if (server && 'instanceId' in server) {
      return this.instances.get((server as any).instanceId);
    }
    return undefined;
  }

  // ── Health Checking ─────────────────────────────────────────────

  /**
   * Check if an instance is reachable.
   * Uses the /health endpoint with a short timeout.
   * Does NOT require authentication.
   */
  async checkInstanceHealth(instanceUrl: string): Promise<boolean> {
    const url = normalizeInstanceUrl(instanceUrl);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
      const resp = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      return resp.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check the health of all saved instances and update their online status.
   * Called periodically and on app startup.
   */
  async checkAllSavedInstances(): Promise<void> {
    const { savedInstances, setOnlineStatus } = useInstanceStore.getState();

    const checks = savedInstances.map(async (inst) => {
      setOnlineStatus(inst.id, 'checking');
      const isOnline = await this.checkInstanceHealth(inst.url);
      setOnlineStatus(inst.id, isOnline ? 'online' : 'offline');

      // If a connected instance went offline, update connection status
      if (!isOnline) {
        const conn = this.instances.get(inst.id);
        if (conn && conn.status === 'connected') {
          conn.status = 'error';
          conn.error = 'Instance went offline';
          useInstanceStore.getState().setConnected(inst.id, false);
        }
      }

      return { id: inst.id, online: isOnline };
    });

    await Promise.allSettled(checks);
  }

  /** Start periodic health checks */
  private startHealthChecks(): void {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(() => {
      this.checkAllSavedInstances();
    }, HEALTH_CHECK_INTERVAL);
  }

  /** Stop periodic health checks */
  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /** Create socket callbacks for a specific instance */
  private createCallbacks(instanceId: string): InstanceSocketCallbacks {
    return {
      onPresenceUpdate: ({ userId, status }) => {
        useServerStore.getState().setUserOnline(userId, status === 'online');
      },

      onVoiceJoined: ({ channelId, users, hostUserId, isHost }) => {
        const voiceStore = useVoiceStore.getState();
        voiceStore.setConnected(true, channelId);
        voiceStore.setHost(hostUserId);
        voiceStore.setIsHost(isHost);
        voiceStore.setChannelUsers(
          users.map((u: any) => ({
            oderId: u.userId || u.oderId,
            username: u.username,
            displayName: u.displayName,
            selfMute: u.selfMute || false,
            selfDeaf: u.selfDeaf || false,
            speaking: false,
          }))
        );
      },

      onVoiceUserJoined: ({ userId, username }) => {
        useVoiceStore.getState().addChannelUser({
          oderId: userId,
          username,
          displayName: null,
          selfMute: false,
          selfDeaf: false,
          speaking: false,
        });
      },

      onVoiceUserLeft: ({ userId }) => {
        useVoiceStore.getState().removeChannelUser(userId);
      },

      onVoiceHostChanged: ({ hostUserId }) => {
        const voiceStore = useVoiceStore.getState();
        const authStore = useAuthStore.getState();
        voiceStore.setHost(hostUserId);
        voiceStore.setIsHost(hostUserId === authStore.user?.id);
      },

      onVoiceQualityUpdate: ({ userId, quality }) => {
        useVoiceStore.getState().updateConnectionQuality(userId, quality);
      },

      onVoiceStateUpdate: ({ userId, selfMute, selfDeaf }) => {
        useVoiceStore.getState().updateUserVoiceState(userId, { selfMute, selfDeaf });
      },

      onVoiceSpeaking: ({ userId, speaking }) => {
        useVoiceStore.getState().updateUserVoiceState(userId, { speaking });
      },

      onVoiceLeft: () => {
        useVoiceStore.getState().setConnected(false);
      },

      onMessageNew: (message: Message) => {
        useMessageStore.getState().addMessage(message.channelId, message);
      },

      onMessageUpdated: (message: Message) => {
        useMessageStore.getState().updateMessage(message.channelId, message);
      },

      onMessageDeleted: ({ messageId, channelId }) => {
        useMessageStore.getState().deleteMessage(channelId, messageId);
      },

      onTypingStart: ({ channelId, userId, username }) => {
        useMessageStore.getState().addTypingUser(channelId, { userId, username });
        setTimeout(() => {
          useMessageStore.getState().removeTypingUser(channelId, userId);
        }, 5000);
      },

      onTypingStop: ({ channelId, userId }) => {
        useMessageStore.getState().removeTypingUser(channelId, userId);
      },

      // Structural change events
      onServerUpdated: (server) => {
        useServerStore.getState().updateServer(server.id, server);
      },

      onServerDeleted: ({ serverId }) => {
        useServerStore.getState().removeServer(serverId);
      },

      onChannelCreated: (channel) => {
        const { currentServerId } = useServerStore.getState();
        if (channel.serverId === currentServerId) {
          useServerStore.getState().addChannel(channel);
        }
      },

      onChannelUpdated: (channel) => {
        useServerStore.getState().updateChannel(channel.id, channel);
      },

      onChannelDeleted: ({ channelId }) => {
        useServerStore.getState().removeChannel(channelId);
      },

      onCategoryCreated: (category) => {
        const { currentServerId } = useServerStore.getState();
        if (category.serverId === currentServerId) {
          useServerStore.getState().addCategory(category);
        }
      },

      onCategoryUpdated: (category) => {
        useServerStore.getState().updateCategory(category.id, category);
      },

      onCategoryDeleted: ({ categoryId }) => {
        useServerStore.getState().removeCategory(categoryId);
      },

      onRoleCreated: (role) => {
        const { currentServerId } = useServerStore.getState();
        if (role.serverId === currentServerId) {
          useServerStore.getState().addRole(role);
        }
      },

      onRoleUpdated: (role) => {
        useServerStore.getState().updateRole(role.id, role);
      },

      onRoleDeleted: ({ roleId }) => {
        useServerStore.getState().removeRole(roleId);
      },

      // Voice occupancy events (Ventrilo-style sidebar)
      onVoiceUserJoinedChannel: ({ channelId, user }) => {
        useServerStore.getState().addUserToChannelOccupancy(channelId, user);
      },

      onVoiceUserLeftChannel: ({ channelId, userId }) => {
        useServerStore.getState().removeUserFromChannelOccupancy(channelId, userId);
      },

      onVoiceChannelOccupancy: ({ channels }) => {
        useServerStore.getState().setVoiceOccupancy(channels);
      },

      // Lobby events
      onLobbyCreated: ({ channel }) => {
        const { currentServerId } = useServerStore.getState();
        if (channel.serverId === currentServerId) {
          useServerStore.getState().addChannel(channel);
        }
      },

      onLobbyDestroyed: ({ channelId }) => {
        useServerStore.getState().removeChannel(channelId);
        // Clear occupancy for destroyed lobby
        useServerStore.getState().removeUserFromChannelOccupancy(channelId, '');
      },

      onError: ({ message }) => {
        console.error(`[Instance:${instanceId}] Socket error:`, message);
      },
    };
  }
}

export const instanceManager = new InstanceManager();
