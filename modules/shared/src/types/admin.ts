// ============================================================
// Admin Types — Admin panel types for central server management
// ============================================================

/** Admin account as stored in the admins table */
export interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
  role: AdminRole;
  mfaEnabled: boolean;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export type AdminRole = 'admin' | 'superadmin';

/** Admin JWT payload */
export interface AdminTokenUser {
  sub: string;
  username: string;
  role: AdminRole;
}

/** Admin auth result */
export interface AdminAuthResult {
  admin: AdminUser;
  accessToken: string;
  refreshToken: string;
}

/** Admin login result — may require MFA */
export interface AdminLoginResult {
  admin?: AdminUser;
  accessToken?: string;
  refreshToken?: string;
  mfaRequired?: boolean;
  mfaToken?: string;
}

/** Platform dashboard metrics */
export interface PlatformMetrics {
  totalUsers: number;
  onlineUsers: number;
  totalInstances: number;
  activeInstances: number;
  verifiedInstances: number;
  dmBufferSize: number;
  suspendedUsers: number;
  mfaEnabledUsers: number;
  registrationsToday: number;
  registrationsThisWeek: number;
  tierDistribution: Record<string, number>;
}

/** Registration history data point */
export interface RegistrationHistoryPoint {
  date: string;
  count: number;
}

/** DM buffer stats */
export interface DmBufferStats {
  totalPending: number;
  totalDelivered: number;
  totalExpired: number;
  conversations: DmBufferConversation[];
}

/** DM buffer conversation info */
export interface DmBufferConversation {
  id: string;
  user1: string;
  user2: string;
  pendingCount: number;
  lastMessageAt: string | null;
}

/** Audit log entry */
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  userUsername: string | null;
  actorType: 'user' | 'admin';
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}

/** Audit log stats */
export interface AuditLogStats {
  totalLogs: number;
  actionCounts: Record<string, number>;
  recentActivity: AuditLogEntry[];
}

/** Admin user view (extended CentralUser) */
export interface AdminUserView {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  statusMessage: string | null;
  subscriptionTier: string;
  subscriptionExpiresAt: string | null;
  mfaEnabled: boolean;
  isVerified: boolean;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspendedBy: string | null;
  suspensionReason: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
}

/** Admin instance view */
export interface AdminInstanceView {
  id: string;
  name: string;
  description: string | null;
  url: string;
  ownerId: string;
  ownerUsername: string | null;
  isPublic: boolean;
  isVerified: boolean;
  tags: string[];
  category: string | null;
  region: string | null;
  memberCount: number;
  maxMembers: number;
  iconUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastHeartbeatAt: string | null;
}

/** Subscription info for admin view */
export interface AdminSubscriptionView {
  id: string;
  userId: string;
  username: string;
  email: string;
  displayName: string | null;
  tier: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Subscription stats */
export interface SubscriptionStats {
  tierDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  totalPremium: number;
  totalEnterprise: number;
}
