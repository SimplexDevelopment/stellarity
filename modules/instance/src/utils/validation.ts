import { z } from 'zod';

// User registration schema
export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must not exceed 32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(64, 'Display name must not exceed 64 characters')
    .optional(),
});

// User login schema
export const loginSchema = z.object({
  login: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

// Update user schema
export const updateUserSchema = z.object({
  displayName: z.string().max(64).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  statusMessage: z.string().max(128).optional(),
});

// Create server schema
export const createServerSchema = z.object({
  name: z
    .string()
    .min(1, 'Server name is required')
    .max(64, 'Server name must not exceed 64 characters'),
  description: z.string().max(500).optional(),
  iconUrl: z.string().url().optional(),
  isPublic: z.boolean().optional().default(true),
  password: z.string().min(1).max(128).optional(),
});

// Update server schema
export const updateServerSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(500).nullable().optional(),
  iconUrl: z.string().url().nullable().optional(),
  isPublic: z.boolean().optional(),
  password: z.string().min(1).max(128).optional(),
  removePassword: z.boolean().optional(),
});

// Create channel schema
export const createChannelSchema = z.object({
  name: z
    .string()
    .min(1, 'Channel name is required')
    .max(64, 'Channel name must not exceed 64 characters')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Channel name can only contain letters, numbers, hyphens, and underscores'),
  type: z.enum(['text', 'voice']),
  description: z.string().max(500).optional(),
  categoryId: z.string().optional().nullable(),
  bitrate: z.number().min(8000).max(384000).optional(),
  userLimit: z.number().min(0).max(99).optional(),
});

// Update channel schema
export const updateChannelSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9-_]+$/).optional(),
  description: z.string().max(500).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  position: z.number().min(0).optional(),
  bitrate: z.number().min(8000).max(384000).optional(),
  userLimit: z.number().min(0).max(99).optional(),
});

// Create category schema
export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(64),
  position: z.number().min(0).optional(),
});

// Update category schema
export const updateCategorySchema = z.object({
  name: z.string().min(1).max(64).optional(),
  position: z.number().min(0).optional(),
});

// Create role schema
export const createRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required').max(64),
  color: z.string().max(7).optional(),
  permissions: z.record(z.boolean()).optional(),
});

// Update role schema
export const updateRoleSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  color: z.string().max(7).nullable().optional(),
  position: z.number().min(0).optional(),
  permissions: z.record(z.boolean()).optional(),
});

// Message schema
export const messageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message must not exceed 2000 characters'),
  encrypted: z.boolean().optional(),
});

// Create lobby schema (Build-a-Lobby)
export const createLobbySchema = z.object({
  name: z
    .string()
    .min(1, 'Lobby name is required')
    .max(64, 'Lobby name must not exceed 64 characters'),
  userLimit: z.number().min(0).max(99).optional().default(0),
  password: z.string().min(1).max(64).optional(),
});

// Server features schema
export const serverFeaturesSchema = z.object({
  buildALobbyEnabled: z.boolean().optional(),
  buildALobbyPosition: z.number().min(0).optional(),
  autoOverflowEnabled: z.boolean().optional(),
});

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateServerInput = z.infer<typeof createServerSchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type CreateLobbyInput = z.infer<typeof createLobbySchema>;
export type ServerFeaturesInput = z.infer<typeof serverFeaturesSchema>;
