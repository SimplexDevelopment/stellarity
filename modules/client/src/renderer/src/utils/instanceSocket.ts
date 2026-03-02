/**
 * Instance Socket Manager
 * 
 * Manages the WebSocket connection to a single instance server.
 * Handles instance-specific real-time events:
 * - Messages (send, edit, delete)
 * - Voice (join, leave, signaling, speaking)
 * - Typing indicators
 * - Server-level presence
 * 
 * One InstanceSocketManager is created per connected instance.
 */
import { io, Socket } from 'socket.io-client';

export interface InstanceSocketCallbacks {
  onPresenceUpdate?: (data: { userId: string; status: string }) => void;
  onVoiceJoined?: (data: { channelId: string; serverId: string; users: any[]; channelKey: string; hostUserId: string; isHost: boolean }) => void;
  onVoiceUserJoined?: (data: { userId: string; username: string; displayName: string | null }) => void;
  onVoiceUserLeft?: (data: { userId: string }) => void;
  onVoiceHostChanged?: (data: { hostUserId: string }) => void;
  onVoiceQualityUpdate?: (data: { userId: string; quality: number }) => void;
  onVoiceStateUpdate?: (data: { userId: string; selfMute?: boolean; selfDeaf?: boolean; channelId?: string | null }) => void;
  onVoiceSpeaking?: (data: { userId: string; speaking: boolean }) => void;
  onVoiceLeft?: () => void;
  onVoiceData?: (data: { fromUserId: string; data: ArrayBuffer }) => void;
  onMessageNew?: (message: any) => void;
  onMessageUpdated?: (message: any) => void;
  onMessageDeleted?: (data: { messageId: string; channelId: string }) => void;
  onTypingStart?: (data: { channelId: string; userId: string; username: string }) => void;
  onTypingStop?: (data: { channelId: string; userId: string }) => void;
  // Structural change events
  onServerUpdated?: (server: any) => void;
  onServerDeleted?: (data: { serverId: string }) => void;
  onChannelCreated?: (channel: any) => void;
  onChannelUpdated?: (channel: any) => void;
  onChannelDeleted?: (data: { channelId: string; serverId: string }) => void;
  onCategoryCreated?: (category: any) => void;
  onCategoryUpdated?: (category: any) => void;
  onCategoryDeleted?: (data: { categoryId: string; serverId: string }) => void;
  onRoleCreated?: (role: any) => void;
  onRoleUpdated?: (role: any) => void;
  onRoleDeleted?: (data: { roleId: string; serverId: string }) => void;
  onMemberRoleUpdated?: (data: { serverId: string; userId: string; roleIds: string[] }) => void;
  // Voice occupancy events (Ventrilo-style sidebar)
  onVoiceUserJoinedChannel?: (data: { channelId: string; user: any; userCount: number }) => void;
  onVoiceUserLeftChannel?: (data: { channelId: string; userId: string; userCount: number }) => void;
  onVoiceChannelOccupancy?: (data: { serverId: string; channels: { channelId: string; users: any[] }[] }) => void;
  // Lobby events
  onLobbyCreated?: (data: { channel: any }) => void;
  onLobbyDestroyed?: (data: { channelId: string; serverId: string }) => void;
  onLobbyPasswordRequired?: (data: { channelId: string }) => void;
  onError?: (data: { message: string }) => void;
}

export class InstanceSocketManager {
  private socket: Socket | null = null;
  private callbacks: InstanceSocketCallbacks = {};
  private currentServerId: string | null = null;
  public readonly instanceId: string;
  public readonly instanceUrl: string;

  constructor(instanceUrl: string, instanceId: string) {
    this.instanceUrl = instanceUrl.replace(/\/$/, '');
    this.instanceId = instanceId;
  }

  connect(token: string): void {
    if (this.socket?.connected) return;

    this.socket = io(this.instanceUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupListeners();
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  setCallbacks(callbacks: InstanceSocketCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log(`[InstanceSocket:${this.instanceId}] Connected`);
      // Rejoin server room on reconnect (room memberships are lost on disconnect)
      if (this.currentServerId) {
        console.log(`[InstanceSocket:${this.instanceId}] Rejoining server room: ${this.currentServerId}`);
        this.socket?.emit('server:join', this.currentServerId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`[InstanceSocket:${this.instanceId}] Disconnected:`, reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error(`[InstanceSocket:${this.instanceId}] Error:`, error.message);
    });

    // Presence
    this.socket.on('presence:update', (data) => this.callbacks.onPresenceUpdate?.(data));

    // Voice events
    this.socket.on('voice:joined', (data) => this.callbacks.onVoiceJoined?.(data));
    this.socket.on('voice:user-joined', (data) => this.callbacks.onVoiceUserJoined?.(data));
    this.socket.on('voice:user-left', (data) => this.callbacks.onVoiceUserLeft?.(data));
    this.socket.on('voice:host-changed', (data) => this.callbacks.onVoiceHostChanged?.(data));
    this.socket.on('voice:quality-update', (data) => this.callbacks.onVoiceQualityUpdate?.(data));
    this.socket.on('voice:state-update', (data) => this.callbacks.onVoiceStateUpdate?.(data));
    this.socket.on('voice:speaking', (data) => this.callbacks.onVoiceSpeaking?.(data));
    this.socket.on('voice:left', () => this.callbacks.onVoiceLeft?.());
    this.socket.on('voice:data', (data) => this.callbacks.onVoiceData?.(data));

    // Message events
    this.socket.on('message:new', (msg) => this.callbacks.onMessageNew?.(msg));
    this.socket.on('message:updated', (msg) => this.callbacks.onMessageUpdated?.(msg));
    this.socket.on('message:deleted', (data) => this.callbacks.onMessageDeleted?.(data));

    // Typing events
    this.socket.on('typing:start', (data) => this.callbacks.onTypingStart?.(data));
    this.socket.on('typing:stop', (data) => this.callbacks.onTypingStop?.(data));

    // Structural change events
    this.socket.on('server:updated', (data) => this.callbacks.onServerUpdated?.(data));
    this.socket.on('server:deleted', (data) => this.callbacks.onServerDeleted?.(data));
    this.socket.on('channel:created', (data) => this.callbacks.onChannelCreated?.(data));
    this.socket.on('channel:updated', (data) => this.callbacks.onChannelUpdated?.(data));
    this.socket.on('channel:deleted', (data) => this.callbacks.onChannelDeleted?.(data));
    this.socket.on('category:created', (data) => this.callbacks.onCategoryCreated?.(data));
    this.socket.on('category:updated', (data) => this.callbacks.onCategoryUpdated?.(data));
    this.socket.on('category:deleted', (data) => this.callbacks.onCategoryDeleted?.(data));
    this.socket.on('role:created', (data) => this.callbacks.onRoleCreated?.(data));
    this.socket.on('role:updated', (data) => this.callbacks.onRoleUpdated?.(data));
    this.socket.on('role:deleted', (data) => this.callbacks.onRoleDeleted?.(data));
    this.socket.on('member:role-updated', (data) => this.callbacks.onMemberRoleUpdated?.(data));

    // Voice occupancy events (Ventrilo-style sidebar)
    this.socket.on('voice:user-joined-channel', (data) => this.callbacks.onVoiceUserJoinedChannel?.(data));
    this.socket.on('voice:user-left-channel', (data) => this.callbacks.onVoiceUserLeftChannel?.(data));
    this.socket.on('voice:channel-occupancy', (data) => this.callbacks.onVoiceChannelOccupancy?.(data));

    // Lobby events
    this.socket.on('lobby:created', (data) => this.callbacks.onLobbyCreated?.(data));
    this.socket.on('lobby:destroyed', (data) => this.callbacks.onLobbyDestroyed?.(data));
    this.socket.on('lobby:password-required', (data) => this.callbacks.onLobbyPasswordRequired?.(data));

    // Error
    this.socket.on('error', (data) => this.callbacks.onError?.(data));
  }

  // ── Server Methods ────────────────────────────────────────────────

  joinServer(serverId: string): void {
    this.currentServerId = serverId;
    this.socket?.emit('server:join', serverId);
  }

  leaveServer(serverId: string): void {
    if (this.currentServerId === serverId) {
      this.currentServerId = null;
    }
    this.socket?.emit('server:leave', serverId);
  }

  // ── Voice Methods ─────────────────────────────────────────────────

  joinVoiceChannel(channelId: string, serverId: string): void {
    this.socket?.emit('voice:join', { channelId, serverId });
  }

  leaveVoiceChannel(): void {
    this.socket?.emit('voice:leave');
  }

  updateVoiceState(selfMute: boolean, selfDeaf: boolean): void {
    this.socket?.emit('voice:state', { selfMute, selfDeaf });
  }

  sendVoiceData(data: ArrayBuffer): void {
    this.socket?.emit('voice:data', data);
  }

  sendSpeakingState(speaking: boolean): void {
    this.socket?.emit('voice:speaking', speaking);
  }

  sendConnectionQuality(quality: number): void {
    this.socket?.emit('voice:quality', { quality });
  }

  requestHostMigration(): void {
    this.socket?.emit('voice:request-host-migration');
  }

  // ── Lobby Methods ─────────────────────────────────────────────────

  createLobby(serverId: string, name: string, userLimit?: number, password?: string): void {
    this.socket?.emit('lobby:create', { serverId, name, userLimit, password });
  }

  verifyLobbyPassword(
    channelId: string,
    password: string,
    callback?: (result: { success: boolean; error?: string }) => void
  ): void {
    this.socket?.emit('lobby:verify-password', { channelId, password }, callback);
  }

  // ── Message Methods ───────────────────────────────────────────────

  sendMessage(channelId: string, content: string, encrypted = false, replyToId?: string): void {
    this.socket?.emit('message:send', { channelId, content, encrypted, replyToId });
  }

  editMessage(messageId: string, content: string): void {
    this.socket?.emit('message:edit', { messageId, content });
  }

  deleteMessage(messageId: string, channelId: string): void {
    this.socket?.emit('message:delete', { messageId, channelId });
  }

  startTyping(channelId: string): void {
    this.socket?.emit('typing:start', { channelId });
  }

  stopTyping(channelId: string): void {
    this.socket?.emit('typing:stop', { channelId });
  }

  // ── Utility ───────────────────────────────────────────────────────

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}
