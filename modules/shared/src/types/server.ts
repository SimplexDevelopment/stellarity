// ============================================================
// Server Types — Communities within an instance
// ============================================================

/** A server (guild/community) within an instance */
export interface Server {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  ownerId: string;
  inviteCode: string;
  maxMembers: number;
  isPublic: boolean;
  hasPassword: boolean;
  createdAt: string;
  memberCount?: number;
}

/** A category that groups channels within a server */
export interface Category {
  id: string;
  serverId: string;
  name: string;
  position: number;
  createdAt: string;
}

/** A channel within a server */
export interface Channel {
  id: string;
  serverId: string;
  categoryId: string | null;
  name: string;
  type: ChannelType;
  description: string | null;
  position: number;
  bitrate: number;
  userLimit: number;
  isTemporary: boolean;
  createdBy: string | null;
  expiresWhenEmpty: boolean;
  hasPassword: boolean;
  createdAt: string;
  isEncrypted: boolean;
  ephemeralDefault: number | null;
}

export type ChannelType = 'text' | 'voice' | 'thread';

/** Server feature toggles (per-server settings) */
export interface ServerFeatures {
  buildALobbyEnabled: boolean;
  buildALobbyPosition: number;
  autoOverflowEnabled: boolean;
}

export const DEFAULT_SERVER_FEATURES: ServerFeatures = {
  buildALobbyEnabled: true,
  buildALobbyPosition: 0,
  autoOverflowEnabled: false,
};

/** Input for creating a temporary "Build a Lobby" voice channel */
export interface CreateLobbyInput {
  name: string;
  userLimit?: number;
  password?: string;
}

/** Occupancy info for a single voice channel (used in sidebar display) */
export interface VoiceChannelOccupancy {
  channelId: string;
  users: VoiceOccupantUser[];
}

/** Minimal user info shown in voice channel occupancy sidebar */
export interface VoiceOccupantUser {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
}

/** A member of a server on an instance */
export interface ServerMember {
  id: string;
  serverId: string;
  userId: string;
  nickname: string | null;
  joinedAt: string;
  roles: string[];
  user?: MemberUser;
}

/** Minimal user info for member displays (from JWT claims) */
export interface MemberUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status?: string;
}

/** Role definition for per-server permissions */
export interface Role {
  id: string;
  serverId: string;
  name: string;
  color: string | null;
  position: number;
  permissions: RolePermissions;
  createdAt: string;
}

/** Granular permissions for roles */
export interface RolePermissions {
  manageServer: boolean;
  manageChannels: boolean;
  manageRoles: boolean;
  manageMessages: boolean;
  kickMembers: boolean;
  banMembers: boolean;
  sendMessages: boolean;
  readMessages: boolean;
  connectVoice: boolean;
  speakVoice: boolean;
  muteMembers: boolean;
  deafenMembers: boolean;
  moveMembers: boolean;
  useVAD: boolean;
  pinMessages: boolean;
  mentionEveryone: boolean;
  manageThreads: boolean;
  useReactions: boolean;
}

/** Default permissions for new members */
export const DEFAULT_PERMISSIONS: RolePermissions = {
  manageServer: false,
  manageChannels: false,
  manageRoles: false,
  manageMessages: false,
  kickMembers: false,
  banMembers: false,
  sendMessages: true,
  readMessages: true,
  connectVoice: true,
  speakVoice: true,
  muteMembers: false,
  deafenMembers: false,
  moveMembers: false,
  useVAD: true,
  pinMessages: false,
  mentionEveryone: false,
  manageThreads: false,
  useReactions: true,
};

// ============================================================
// Moderation Types
// ============================================================

/** Types of moderation actions */
export type ModerationActionType = 'ban' | 'kick' | 'mute' | 'warn' | 'timeout';

/** A moderation action record */
export interface ModerationAction {
  id: string;
  serverId: string;
  userId: string;
  moderatorId: string;
  action: ModerationActionType;
  reason: string | null;
  duration: number | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

/** Input for creating a moderation action */
export interface CreateModerationInput {
  serverId: string;
  userId: string;
  moderatorId: string;
  action: ModerationActionType;
  reason?: string;
  duration?: number; // seconds — for timeout/mute
}

/** Summary of a user's moderation history in a server */
export interface ModerationSummary {
  userId: string;
  serverId: string;
  isBanned: boolean;
  isMuted: boolean;
  isTimedOut: boolean;
  timeoutExpiresAt: string | null;
  totalActions: number;
  recentActions: ModerationAction[];
}

// ============================================================
// Input Types — For creating/updating resources
// ============================================================

/** Input for updating a server */
export interface UpdateServerInput {
  name?: string;
  description?: string | null;
  iconUrl?: string | null;
  isPublic?: boolean;
  password?: string;       // Set a new password (hashed server-side)
  removePassword?: boolean; // Remove existing password
}

/** Input for creating a category */
export interface CreateCategoryInput {
  name: string;
  position?: number;
}

/** Input for updating a category */
export interface UpdateCategoryInput {
  name?: string;
  position?: number;
}

/** Input for updating a channel */
export interface UpdateChannelInput {
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  position?: number;
  bitrate?: number;
  userLimit?: number;
}

/** Input for creating a role */
export interface CreateRoleInput {
  name: string;
  color?: string;
  permissions?: Partial<RolePermissions>;
}

/** Input for updating a role */
export interface UpdateRoleInput {
  name?: string;
  color?: string | null;
  position?: number;
  permissions?: Partial<RolePermissions>;
}

/** A server as seen in the browse endpoint (includes user-relative flags) */
export interface BrowsableServer {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  memberCount: number;
  isPublic: boolean;
  hasPassword: boolean;
  inviteCode: string | null; // Only included for public servers
  isMember: boolean;
}

/** Server creation policy for an instance */
export type ServerCreationPolicy = 'everyone' | 'selected';
