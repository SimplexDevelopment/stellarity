// ============================================================
// Auth Types — Centralized identity & authentication
// ============================================================

/** User as stored/managed by the central server */
export interface CentralUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  statusMessage: string | null;
  createdAt: string;
  isVerified: boolean;
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt: string | null;
  mfaEnabled: boolean;
}

/** Public-facing user info (no email, no subscription internals) */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  statusMessage: string | null;
}

/** User info embedded in signed JWTs — what instances see */
export interface TokenUser {
  sub: string; // userId
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  tier: SubscriptionTier;
}

export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';

export type SubscriptionTier = 'free' | 'premium' | 'enterprise';

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: number;
}

export interface AuthResult {
  user: CentralUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: number;
}

export interface MFASetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface MFAVerifyResult {
  verified: boolean;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiry?: number;
}
