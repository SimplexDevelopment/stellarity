// ============================================================
// Shared Module — Barrel Export
// ============================================================

// Types
export type {
  CentralUser,
  PublicUser,
  TokenUser,
  UserStatus,
  SubscriptionTier,
  AuthTokenPair,
  AuthResult,
  MFASetupResult,
  MFAVerifyResult,
} from './types/auth.js';

export type {
  InstanceInfo,
  InstanceConfig,
  InstanceIdentity,
  InstancePublicInfo,
  InstanceConnection,
  InstanceConnectionStatus,
} from './types/instance.js';

export type {
  DiscoveryListing,
  DiscoveryCategory,
  DiscoveryQuery,
  DiscoverySortOrder,
  DiscoveryResults,
  DiscoveryRegistration,
  DiscoveryHeartbeat,
} from './types/discovery.js';

export type {
  Server,
  Category,
  Channel,
  ChannelType,
  ServerMember,
  MemberUser,
  Role,
  RolePermissions,
  ModerationAction,
  ModerationActionType,
  CreateModerationInput,
  ModerationSummary,
  UpdateServerInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  UpdateChannelInput,
  CreateRoleInput,
  UpdateRoleInput,
  BrowsableServer,
  ServerCreationPolicy,
  ServerFeatures,
  CreateLobbyInput,
  VoiceChannelOccupancy,
  VoiceOccupantUser,
} from './types/server.js';

export { DEFAULT_PERMISSIONS, DEFAULT_SERVER_FEATURES } from './types/server.js';

export type {
  Message,
  MessageAttachment,
  MessageEmbed,
  MessagePage,
  TypingState,
} from './types/message.js';

export type {
  VoiceState,
  VoiceChannelState,
  VoiceUser,
  VoiceJoinedPayload,
  VoiceSignal,
  RTCSignalData,
  VoiceQualityReport,
} from './types/voice.js';

export type {
  DirectMessage,
  DMDeliveryStatus,
  DMConversation,
  PendingDM,
  DMSignal,
} from './types/dm.js';

export type {
  AdminUser,
  AdminRole,
  AdminTokenUser,
  AdminAuthResult,
  AdminLoginResult,
  PlatformMetrics,
  RegistrationHistoryPoint,
  DmBufferStats,
  DmBufferConversation,
  AuditLogEntry,
  AuditLogStats,
  AdminUserView,
  AdminInstanceView,
  AdminSubscriptionView,
  SubscriptionStats,
} from './types/admin.js';

export type {
  InstanceServerToClientEvents,
  InstanceClientToServerEvents,
  CentralServerToClientEvents,
  CentralClientToServerEvents,
} from './types/socket.js';

// New feature types
export type {
  MessageReaction,
  ReactionRecord,
  ReactionPayload,
} from './types/reaction.js';

export type {
  Thread,
  CreateThreadInput,
  UpdateThreadInput,
  ThreadMessage,
} from './types/thread.js';

export type {
  FriendRequestStatus,
  Friendship,
  FriendUser,
  FriendRequest,
  FriendActivity,
} from './types/friend.js';

export type {
  ChannelEncryption,
  ChannelMemberKey,
  KeyExchangeRequest,
  EncryptedKeyBundle,
} from './types/encryption.js';

export type {
  EphemeralDuration,
  ScheduledMessage,
  ScheduledMessageStatus,
  CreateScheduledMessageInput,
  CreateEphemeralMessageInput,
} from './types/ephemeral.js';

// Constants & Validation
export { PROTOCOL_VERSION, JWT_ALGORITHM, LIMITS, PATTERNS, DEFAULT_MEMBER_PERMISSIONS, apiSuccess, apiError } from './constants.js';
export type { ApiResponse, PaginatedResponse } from './constants.js';

// Errors
export {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from './errors.js';

export {
  registerSchema,
  loginSchema,
  mfaVerifySchema,
  updateProfileSchema,
  createServerSchema,
  createChannelSchema,
  updateServerSchema,
  createCategorySchema,
  updateCategorySchema,
  updateChannelSchema,
  createRoleSchema,
  updateRoleSchema,
  messageSchema,
  instanceRegistrationSchema,
  discoveryQuerySchema,
  dmSendSchema,
  adminLoginSchema,
  adminCreateSchema,
  adminUserUpdateSchema,
  adminSuspendSchema,
  adminTierOverrideSchema,
  createLobbySchema,
  serverFeaturesSchema,
  reactionSchema,
  createThreadSchema,
  updateThreadSchema,
  friendRequestSchema,
  ephemeralMessageSchema,
  scheduledMessageSchema,
  updateScheduledMessageSchema,
  channelKeyRegistrationSchema,
} from './validation.js';

export type {
  RegisterInput,
  LoginInput,
  MFAVerifyInput,
  UpdateProfileInput,
  CreateServerInput,
  CreateChannelInput,
  MessageInput,
  InstanceRegistrationInput,
  DiscoveryQueryInput,
  DMSendInput,
  AdminLoginInput,
  AdminCreateInput,
  AdminUserUpdateInput,
  AdminSuspendInput,
  AdminTierOverrideInput,
  CreateLobbyInputValidated,
  ServerFeaturesInput,
  ReactionInput,
  CreateThreadInputValidated,
  UpdateThreadInputValidated,
  FriendRequestInput,
  EphemeralMessageInput,
  ScheduledMessageInput,
  UpdateScheduledMessageInput,
  ChannelKeyRegistrationInput,
} from './validation.js';
