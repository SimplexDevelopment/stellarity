// ============================================================
// Constants — Shared configuration values
// ============================================================

/** Version of the protocol (for compatibility checks between client/server) */
export const PROTOCOL_VERSION = '1.0.0';

/** JWT algorithm used for signing (Ed25519 via EdDSA) */
export const JWT_ALGORITHM = 'EdDSA' as const;

/** Max lengths for validation */
export const LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 32,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  DISPLAY_NAME_MAX: 64,
  EMAIL_MAX: 255,
  SERVER_NAME_MAX: 64,
  CHANNEL_NAME_MAX: 64,
  MESSAGE_MAX: 2000,
  DESCRIPTION_MAX: 500,
  STATUS_MESSAGE_MAX: 128,
  SERVER_MAX_MEMBERS_DEFAULT: 500,
  VOICE_MAX_USERS_DEFAULT: 50,
  VOICE_BITRATE_MIN: 8000,
  VOICE_BITRATE_MAX: 384000,
  VOICE_BITRATE_DEFAULT: 64000,
  DM_BUFFER_TTL_DAYS: 30,
  INSTANCE_DEFAULT_PORT: 4150,
  INSTANCE_HEARTBEAT_INTERVAL_MS: 60_000,     // 1 minute
  INSTANCE_STALE_THRESHOLD_MS: 5 * 60_000,    // 5 minutes
  DISCOVERY_PAGE_SIZE_DEFAULT: 20,
  DISCOVERY_PAGE_SIZE_MAX: 100,
  LOBBY_NAME_MAX: 64,
  LOBBY_CLEANUP_INTERVAL_MS: 30_000,
  DEFAULT_CATEGORY_TEXT: 'Relay',
  DEFAULT_CATEGORY_VOICE: 'Comms',
  REACTIONS_PER_MESSAGE_MAX: 20,
  REACTIONS_PER_USER_PER_MESSAGE: 20,
  THREAD_NAME_MAX: 64,
  THREADS_PER_CHANNEL_MAX: 100,
  EPHEMERAL_TTL_MIN: 30,
  EPHEMERAL_TTL_MAX: 604800,
  SCHEDULED_MAX_FUTURE_DAYS: 30,
  SCHEDULED_PER_USER_MAX: 25,
  FRIENDS_MAX: 1000,
  FRIEND_REQUESTS_MAX: 100,
  EPHEMERAL_CLEANUP_INTERVAL_MS: 15_000,
  SCHEDULED_CHECK_INTERVAL_MS: 10_000,
} as const;

/** Regex patterns for validation */
export const PATTERNS = {
  USERNAME: /^[a-zA-Z0-9_]+$/,
  CHANNEL_NAME: /^[a-zA-Z0-9\-_]+$/,
  INVITE_CODE: /^[a-zA-Z0-9]{6,16}$/,
} as const;

/** Default role permissions for new server members */
export const DEFAULT_MEMBER_PERMISSIONS = {
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
} as const;

/** API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Array<{ field: string; message: string }>;
}

/** Build a successful API response. */
export function apiSuccess<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

/** Build a failed API response. */
export function apiError(
  error: string,
  fieldErrors?: Array<{ field: string; message: string }>
): ApiResponse<never> {
  const res: ApiResponse<never> = { success: false, error };
  if (fieldErrors?.length) res.errors = fieldErrors;
  return res;
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
