// ============================================================
// Validation Schemas — Shared Zod schemas for client & server
// ============================================================

import { z } from 'zod';
import { LIMITS, PATTERNS } from './constants.js';

// ---- Auth Schemas ----

export const registerSchema = z.object({
  username: z
    .string()
    .min(LIMITS.USERNAME_MIN, `Username must be at least ${LIMITS.USERNAME_MIN} characters`)
    .max(LIMITS.USERNAME_MAX, `Username must not exceed ${LIMITS.USERNAME_MAX} characters`)
    .regex(PATTERNS.USERNAME, 'Username can only contain letters, numbers, and underscores'),
  email: z
    .string()
    .email('Invalid email address')
    .max(LIMITS.EMAIL_MAX, `Email must not exceed ${LIMITS.EMAIL_MAX} characters`),
  password: z
    .string()
    .min(LIMITS.PASSWORD_MIN, `Password must be at least ${LIMITS.PASSWORD_MIN} characters`)
    .max(LIMITS.PASSWORD_MAX, `Password must not exceed ${LIMITS.PASSWORD_MAX} characters`)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(LIMITS.DISPLAY_NAME_MAX, `Display name must not exceed ${LIMITS.DISPLAY_NAME_MAX} characters`)
    .optional(),
});

export const loginSchema = z.object({
  login: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const mfaVerifySchema = z.object({
  code: z.string().length(6, 'MFA code must be 6 digits').regex(/^\d+$/, 'MFA code must be numeric'),
  token: z.string().min(1, 'Temporary token is required'),
});

export const updateProfileSchema = z.object({
  displayName: z.string().max(LIMITS.DISPLAY_NAME_MAX).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  statusMessage: z.string().max(LIMITS.STATUS_MESSAGE_MAX).optional(),
});

// ---- Server Schemas ----

export const createServerSchema = z.object({
  name: z
    .string()
    .min(1, 'Server name is required')
    .max(LIMITS.SERVER_NAME_MAX, `Server name must not exceed ${LIMITS.SERVER_NAME_MAX} characters`),
  description: z.string().max(LIMITS.DESCRIPTION_MAX).optional(),
  iconUrl: z.string().url().optional(),
  isPublic: z.boolean().optional().default(true),
  password: z.string().min(1).max(128).optional(),
});

export const updateServerSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(LIMITS.SERVER_NAME_MAX)
    .optional(),
  description: z.string().max(LIMITS.DESCRIPTION_MAX).nullable().optional(),
  iconUrl: z.string().url().nullable().optional(),
  isPublic: z.boolean().optional(),
  password: z.string().min(1).max(128).optional(),
  removePassword: z.boolean().optional(),
});

export const createChannelSchema = z.object({
  name: z
    .string()
    .min(1, 'Channel name is required')
    .max(LIMITS.CHANNEL_NAME_MAX, `Channel name must not exceed ${LIMITS.CHANNEL_NAME_MAX} characters`)
    .regex(PATTERNS.CHANNEL_NAME, 'Channel name can only contain letters, numbers, hyphens, and underscores'),
  type: z.enum(['text', 'voice']),
  description: z.string().max(LIMITS.DESCRIPTION_MAX).optional(),
  categoryId: z.string().optional().nullable(),
  bitrate: z.number().min(LIMITS.VOICE_BITRATE_MIN).max(LIMITS.VOICE_BITRATE_MAX).optional(),
  userLimit: z.number().min(0).max(99).optional(),
});

export const updateChannelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(LIMITS.CHANNEL_NAME_MAX)
    .regex(PATTERNS.CHANNEL_NAME)
    .optional(),
  description: z.string().max(LIMITS.DESCRIPTION_MAX).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  position: z.number().min(0).optional(),
  bitrate: z.number().min(LIMITS.VOICE_BITRATE_MIN).max(LIMITS.VOICE_BITRATE_MAX).optional(),
  userLimit: z.number().min(0).max(99).optional(),
});

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, 'Category name is required')
    .max(LIMITS.SERVER_NAME_MAX, `Category name must not exceed ${LIMITS.SERVER_NAME_MAX} characters`),
  position: z.number().min(0).optional(),
});

export const updateCategorySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(LIMITS.SERVER_NAME_MAX)
    .optional(),
  position: z.number().min(0).optional(),
});

export const createLobbySchema = z.object({
  name: z
    .string()
    .min(1, 'Lobby name is required')
    .max(LIMITS.LOBBY_NAME_MAX, `Lobby name must not exceed ${LIMITS.LOBBY_NAME_MAX} characters`),
  userLimit: z.number().min(0).max(99).optional(),
  password: z.string().min(1).max(64).optional(),
});

export const serverFeaturesSchema = z.object({
  buildALobbyEnabled: z.boolean().optional(),
  buildALobbyPosition: z.number().min(0).optional(),
  autoOverflowEnabled: z.boolean().optional(),
});

export const createRoleSchema = z.object({
  name: z
    .string()
    .min(1, 'Role name is required')
    .max(LIMITS.SERVER_NAME_MAX),
  color: z.string().max(7).optional(),
  permissions: z.record(z.boolean()).optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(LIMITS.SERVER_NAME_MAX).optional(),
  color: z.string().max(7).nullable().optional(),
  position: z.number().min(0).optional(),
  permissions: z.record(z.boolean()).optional(),
});

// ---- Message Schemas ----

export const messageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(LIMITS.MESSAGE_MAX, `Message must not exceed ${LIMITS.MESSAGE_MAX} characters`),
  encrypted: z.boolean().optional(),
  replyToId: z.string().uuid().optional(),
});

// ---- Discovery Schemas ----

export const instanceRegistrationSchema = z.object({
  instanceName: z.string().min(1).max(LIMITS.SERVER_NAME_MAX),
  description: z.string().max(LIMITS.DESCRIPTION_MAX).nullable().optional(),
  url: z.string().url('Instance URL must be a valid URL'),
  publicKey: z.string().min(1, 'Public key is required'),
  tags: z.array(z.string().max(32)).max(10).optional().default([]),
  region: z.string().max(64).nullable().optional(),
  iconUrl: z.string().url().nullable().optional(),
  maxMembers: z.number().min(1).max(100000).optional().default(LIMITS.SERVER_MAX_MEMBERS_DEFAULT),
});

export const discoveryQuerySchema = z.object({
  search: z.string().max(100).optional(),
  tags: z.array(z.string()).max(10).optional(),
  category: z.enum(['gaming', 'music', 'education', 'science', 'technology', 'art', 'social', 'community', 'other']).optional(),
  region: z.string().optional(),
  sort: z.enum(['members', 'newest', 'name', 'relevance']).optional().default('relevance'),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(LIMITS.DISCOVERY_PAGE_SIZE_MAX).optional().default(LIMITS.DISCOVERY_PAGE_SIZE_DEFAULT),
});

// ---- DM Schemas ----

export const dmSendSchema = z.object({
  recipientId: z.string().uuid('Invalid recipient ID'),
  content: z.string().min(1).max(LIMITS.MESSAGE_MAX),
  encrypted: z.boolean().optional().default(false),
});

// ---- Admin Schemas ----

export const adminLoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const adminCreateSchema = z.object({
  username: z
    .string()
    .min(LIMITS.USERNAME_MIN)
    .max(LIMITS.USERNAME_MAX)
    .regex(PATTERNS.USERNAME, 'Username can only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(LIMITS.PASSWORD_MIN)
    .max(LIMITS.PASSWORD_MAX),
  displayName: z.string().max(LIMITS.DISPLAY_NAME_MAX).optional(),
  role: z.enum(['admin', 'superadmin']).optional().default('admin'),
});

export const adminUserUpdateSchema = z.object({
  displayName: z.string().max(LIMITS.DISPLAY_NAME_MAX).optional(),
  subscriptionTier: z.enum(['free', 'premium', 'enterprise']).optional(),
  subscriptionExpiresAt: z.string().datetime().nullable().optional(),
  isVerified: z.boolean().optional(),
});

export const adminSuspendSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const adminTierOverrideSchema = z.object({
  tier: z.enum(['free', 'premium', 'enterprise']),
  expiresAt: z.string().datetime().nullable().optional(),
});

// ---- Type exports from schemas ----

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type MFAVerifyInput = z.infer<typeof mfaVerifySchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateServerInput = z.infer<typeof createServerSchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type InstanceRegistrationInput = z.infer<typeof instanceRegistrationSchema>;
export type DiscoveryQueryInput = z.infer<typeof discoveryQuerySchema>;
export type DMSendInput = z.infer<typeof dmSendSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdminCreateInput = z.infer<typeof adminCreateSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
export type AdminSuspendInput = z.infer<typeof adminSuspendSchema>;
export type AdminTierOverrideInput = z.infer<typeof adminTierOverrideSchema>;
export type CreateLobbyInputValidated = z.infer<typeof createLobbySchema>;
export type ServerFeaturesInput = z.infer<typeof serverFeaturesSchema>;
