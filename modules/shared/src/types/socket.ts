// ============================================================
// Socket Event Types — Typed Socket.io events
// ============================================================

import type { Message } from './message.js';
import type { VoiceJoinedPayload, VoiceSignal, VoiceQualityReport } from './voice.js';
import type { DMSignal, DirectMessage } from './dm.js';
import type { Server, Channel, Category, Role } from './server.js';
import type { Thread, ThreadMessage } from './thread.js';
import type { EncryptedKeyBundle } from './encryption.js';
import type { FriendRequest } from './friend.js';

// ---- Instance Socket Events (client <-> instance server) ----

export interface InstanceServerToClientEvents {
  // Presence
  'presence:update': (data: { userId: string; status: string }) => void;
  'presence:bulk': (data: { users: Array<{ userId: string; status: string }> }) => void;

  // Voice
  'voice:joined': (data: VoiceJoinedPayload) => void;
  'voice:user-joined': (data: { userId: string; username: string; displayName: string | null }) => void;
  'voice:user-left': (data: { userId: string }) => void;
  'voice:host-changed': (data: { hostUserId: string }) => void;
  'voice:quality-update': (data: VoiceQualityReport) => void;
  'voice:state-update': (data: { userId: string; selfMute?: boolean; selfDeaf?: boolean; channelId?: string | null }) => void;
  'voice:speaking': (data: { userId: string; speaking: boolean }) => void;
  'voice:signal': (data: { fromUserId: string; signal: VoiceSignal['signal'] }) => void;
  'voice:data': (data: { fromUserId: string; data: Buffer }) => void;
  'voice:left': () => void;

  // Messages
  'message:new': (data: Message) => void;
  'message:updated': (data: Message) => void;
  'message:deleted': (data: { channelId: string; messageId: string }) => void;

  // Typing
  'typing:start': (data: { channelId: string; userId: string; username: string }) => void;
  'typing:stop': (data: { channelId: string; userId: string }) => void;

  // Server membership
  'server:joined': (data: { serverId: string }) => void;
  'server:member-joined': (data: { serverId: string; userId: string; username: string }) => void;
  'server:member-left': (data: { serverId: string; userId: string }) => void;

  // Server structural changes
  'server:updated': (data: { server: Server }) => void;
  'server:deleted': (data: { serverId: string }) => void;

  // Channel structural changes
  'channel:created': (data: { channel: Channel }) => void;
  'channel:updated': (data: { channel: Channel }) => void;
  'channel:deleted': (data: { channelId: string; serverId: string }) => void;

  // Category structural changes
  'category:created': (data: { category: Category }) => void;
  'category:updated': (data: { category: Category }) => void;
  'category:deleted': (data: { categoryId: string; serverId: string }) => void;

  // Role changes
  'role:created': (data: { role: Role }) => void;
  'role:updated': (data: { role: Role }) => void;
  'role:deleted': (data: { roleId: string; serverId: string }) => void;
  'member:role-updated': (data: { serverId: string; userId: string; roleIds: string[] }) => void;

  // Voice occupancy (for sidebar display of all voice channels)
  'voice:user-joined-channel': (data: { channelId: string; serverId: string; user: { userId: string; username: string; displayName: string | null; avatarUrl: string | null; selfMute: boolean; selfDeaf: boolean } }) => void;
  'voice:user-left-channel': (data: { channelId: string; serverId: string; userId: string }) => void;
  'voice:channel-occupancy': (data: { serverId: string; channels: Array<{ channelId: string; users: Array<{ userId: string; username: string; displayName: string | null; avatarUrl: string | null; selfMute: boolean; selfDeaf: boolean }> }> }) => void;

  // Lobby events
  'lobby:created': (data: { channel: import('./server.js').Channel }) => void;
  'lobby:destroyed': (data: { channelId: string; serverId: string }) => void;
  'lobby:password-required': (data: { channelId: string }) => void;

  // Reactions
  'reaction:added': (data: { messageId: string; channelId: string; serverId: string; userId: string; username: string; emoji: string }) => void;
  'reaction:removed': (data: { messageId: string; channelId: string; serverId: string; userId: string; emoji: string }) => void;

  // Threads
  'thread:created': (data: { thread: Thread }) => void;
  'thread:updated': (data: { thread: Thread }) => void;
  'thread:deleted': (data: { threadId: string; channelId: string; serverId: string }) => void;
  'thread:message-new': (data: { threadId: string; message: ThreadMessage }) => void;
  'thread:message-updated': (data: { threadId: string; message: ThreadMessage }) => void;
  'thread:message-deleted': (data: { threadId: string; messageId: string }) => void;

  // Ephemeral
  'message:expired': (data: { channelId: string; messageId: string }) => void;

  // Scheduled
  'scheduled:delivered': (data: { scheduledId: string; message: Message }) => void;

  // E2E Encryption
  'channel:key-exchange': (data: EncryptedKeyBundle) => void;
  'channel:key-rotated': (data: { channelId: string; rotatedAt: string }) => void;

  // Errors
  'error': (data: { message: string; code?: string }) => void;
}

export interface InstanceClientToServerEvents {
  // Server rooms
  'server:join': (serverId: string) => void;
  'server:leave': (serverId: string) => void;

  // Voice
  'voice:join': (data: { channelId: string; serverId: string }) => void;
  'voice:leave': () => void;
  'voice:state': (data: { selfMute: boolean; selfDeaf: boolean }) => void;
  'voice:signal': (data: { targetUserId: string; signal: VoiceSignal['signal'] }) => void;
  'voice:data': (encryptedData: Buffer) => void;
  'voice:speaking': (speaking: boolean) => void;
  'voice:quality': (data: { quality: number }) => void;
  'voice:request-host-migration': () => void;

  // Messages
  'message:send': (data: { channelId: string; content: string; encrypted?: boolean; replyToId?: string }) => void;
  'message:edit': (data: { messageId: string; content: string }) => void;
  'message:delete': (data: { messageId: string; channelId: string }) => void;

  // Typing
  'typing:start': (data: { channelId: string }) => void;
  'typing:stop': (data: { channelId: string }) => void;

  // Lobby
  'lobby:create': (data: { serverId: string; name: string; userLimit?: number; password?: string }) => void;
  'lobby:verify-password': (data: { channelId: string; password: string }, callback: (result: { success: boolean; error?: string }) => void) => void;

  // Reactions
  'reaction:add': (data: { messageId: string; channelId: string; emoji: string }) => void;
  'reaction:remove': (data: { messageId: string; channelId: string; emoji: string }) => void;

  // Threads
  'thread:join': (threadId: string) => void;
  'thread:leave': (threadId: string) => void;
  'thread:message-send': (data: { threadId: string; content: string; encrypted?: boolean; replyToId?: string }) => void;

  // E2E Encryption
  'channel:register-key': (data: { channelId: string; publicKey: string }) => void;
  'channel:key-exchange': (data: EncryptedKeyBundle) => void;
}

// ---- Central Socket Events (client <-> central server) ----

export interface CentralServerToClientEvents {
  // Global presence
  'presence:update': (data: { userId: string; status: string }) => void;

  // DM signaling
  'dm:signal': (data: DMSignal) => void;
  'dm:message': (data: DirectMessage) => void;
  'dm:delivered': (data: { messageId: string }) => void;
  'dm:read': (data: { conversationId: string; readBy: string; readAt: string }) => void;
  'dm:typing': (data: { userId: string; typing: boolean }) => void;

  // Notifications
  'notification:dm': (data: { senderId: string; senderUsername: string; preview: string }) => void;

  // Friends
  'friend:request-received': (data: FriendRequest) => void;
  'friend:request-accepted': (data: { friendshipId: string; userId: string; username: string }) => void;
  'friend:request-rejected': (data: { friendshipId: string; userId: string }) => void;
  'friend:removed': (data: { userId: string }) => void;
  'friend:status-update': (data: { userId: string; status: string; statusMessage: string | null }) => void;
  'friend:blocked': (data: { userId: string }) => void;

  // Errors
  'error': (data: { message: string; code?: string }) => void;
}

export interface CentralClientToServerEvents {
  // DM signaling
  'dm:signal': (data: DMSignal) => void;
  'dm:send': (data: { recipientId: string; content: string; encrypted: boolean }) => void;
  'dm:typing': (data: { recipientId: string; typing: boolean }) => void;
  'dm:read': (data: { conversationId: string }) => void;

  // Presence
  'presence:update': (data: { status: string }) => void;

  // Friends
  'friend:request': (data: { recipientId: string; message?: string }) => void;
  'friend:accept': (data: { requestId: string }) => void;
  'friend:reject': (data: { requestId: string }) => void;
  'friend:remove': (data: { userId: string }) => void;
  'friend:block': (data: { userId: string }) => void;
  'friend:unblock': (data: { userId: string }) => void;
}
