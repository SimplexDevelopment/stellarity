/**
 * Ed25519 Key Management for Central Server
 * 
 * Manages the signing keypair used for JWT authentication.
 * All JWTs issued by the central server are signed with Ed25519 (EdDSA).
 * Instance servers verify these tokens using the public key
 * exposed at GET /api/auth/public-key.
 */
import { generateKeyPair, exportSPKI, exportPKCS8, importSPKI, importPKCS8, SignJWT, jwtVerify } from 'jose';
import type { KeyLike } from 'jose';
import fs from 'fs/promises';
import path from 'path';
import { config } from './index.js';
import { logger } from '../utils/logger.js';

import type { TokenUser } from '@stellarity/shared';

const PUBLIC_KEY_FILE = 'central-public.pem';
const PRIVATE_KEY_FILE = 'central-private.pem';

let publicKey: KeyLike | null = null;
let privateKey: KeyLike | null = null;
let publicKeyPem: string | null = null;

/** Initialize or load the signing keypair */
export async function initializeKeys(): Promise<void> {
  const keyDir = config.jwt.keyDir;
  const pubPath = path.join(keyDir, PUBLIC_KEY_FILE);
  const privPath = path.join(keyDir, PRIVATE_KEY_FILE);

  await fs.mkdir(keyDir, { recursive: true });

  try {
    // Try to load existing keys
    const pubPem = await fs.readFile(pubPath, 'utf-8');
    const privPem = await fs.readFile(privPath, 'utf-8');

    publicKey = await importSPKI(pubPem, 'EdDSA');
    privateKey = await importPKCS8(privPem, 'EdDSA');
    publicKeyPem = pubPem;

    logger.info('Signing keys loaded from disk');
  } catch {
    // Generate new keypair
    logger.info('No signing keys found, generating Ed25519 keypair...');

    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;

    publicKeyPem = await exportSPKI(publicKey);
    const privPem = await exportPKCS8(privateKey);

    await fs.writeFile(pubPath, publicKeyPem, 'utf-8');
    await fs.writeFile(privPath, privPem, { encoding: 'utf-8', mode: 0o600 });

    logger.info('Ed25519 signing keys generated and saved');
  }
}

/** Get the public key in SPKI PEM format (for distribution to instances) */
export function getPublicKeyPem(): string {
  if (!publicKeyPem) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }
  return publicKeyPem;
}

/** Sign a JWT with the central server's private key */
export async function signAccessToken(user: {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  subscriptionTier: string;
}): Promise<string> {
  if (!privateKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  const token = await new SignJWT({
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    tier: user.subscriptionTier,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer('stellarity-central')
    .setExpirationTime(config.jwt.accessTokenTTL)
    .sign(privateKey);

  return token;
}

/** Sign a refresh token */
export async function signRefreshToken(userId: string, username: string): Promise<string> {
  if (!privateKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  const token = await new SignJWT({
    username,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer('stellarity-central')
    .setExpirationTime(config.jwt.refreshTokenTTL)
    .sign(privateKey);

  return token;
}

/** Verify an access token */
export async function verifyAccessToken(token: string): Promise<TokenUser | null> {
  if (!publicKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['EdDSA'],
      issuer: 'stellarity-central',
    });

    if (payload.type !== 'access') return null;

    return {
      sub: payload.sub!,
      username: payload.username as string,
      displayName: (payload.displayName as string) || null,
      avatarUrl: (payload.avatarUrl as string) || null,
      tier: (payload.tier as TokenUser['tier']) || 'free',
    };
  } catch {
    return null;
  }
}

/** Verify a refresh token (returns userId + username) */
export async function verifyRefreshToken(token: string): Promise<{ userId: string; username: string } | null> {
  if (!publicKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['EdDSA'],
      issuer: 'stellarity-central',
    });

    if (payload.type !== 'refresh') return null;

    return {
      userId: payload.sub!,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}

/** Sign a temporary MFA token (distinct type to prevent token confusion) */
export async function signMfaToken(userId: string, username: string): Promise<string> {
  if (!privateKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  const token = await new SignJWT({
    username,
    type: 'mfa',
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer('stellarity-central')
    .setExpirationTime('5m')
    .sign(privateKey);

  return token;
}

/** Verify a temporary MFA token */
export async function verifyMfaToken(token: string): Promise<{ userId: string; username: string } | null> {
  if (!publicKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['EdDSA'],
      issuer: 'stellarity-central',
    });

    if (payload.type !== 'mfa') return null;

    return {
      userId: payload.sub!,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}

/** Hash a token for storage (refresh token rotation) */
export function hashToken(token: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Admin Token Functions ─────────────────────────────────────────

/** Sign an admin access token */
export async function signAdminAccessToken(admin: {
  id: string;
  username: string;
  role: string;
}): Promise<string> {
  if (!privateKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  const token = await new SignJWT({
    username: admin.username,
    role: admin.role,
    type: 'admin-access',
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(admin.id)
    .setIssuedAt()
    .setIssuer('stellarity-central')
    .setExpirationTime('24h')
    .sign(privateKey);

  return token;
}

/** Sign an admin refresh token */
export async function signAdminRefreshToken(adminId: string, username: string): Promise<string> {
  if (!privateKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  const token = await new SignJWT({
    username,
    type: 'admin-refresh',
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(adminId)
    .setIssuedAt()
    .setIssuer('stellarity-central')
    .setExpirationTime('7d')
    .sign(privateKey);

  return token;
}

/** Verify an admin access token */
export async function verifyAdminAccessToken(token: string): Promise<{
  sub: string;
  username: string;
  role: 'admin' | 'superadmin';
} | null> {
  if (!publicKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['EdDSA'],
      issuer: 'stellarity-central',
    });

    if (payload.type !== 'admin-access') return null;

    return {
      sub: payload.sub!,
      username: payload.username as string,
      role: payload.role as 'admin' | 'superadmin',
    };
  } catch {
    return null;
  }
}

/** Verify an admin refresh token */
export async function verifyAdminRefreshToken(token: string): Promise<{
  adminId: string;
  username: string;
} | null> {
  if (!publicKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['EdDSA'],
      issuer: 'stellarity-central',
    });

    if (payload.type !== 'admin-refresh') return null;

    return {
      adminId: payload.sub!,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}

/** Sign a temporary MFA token for admin */
export async function signAdminMfaToken(adminId: string): Promise<string> {
  if (!privateKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  const token = await new SignJWT({
    type: 'admin-mfa',
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(adminId)
    .setIssuedAt()
    .setIssuer('stellarity-central')
    .setExpirationTime('5m')
    .sign(privateKey);

  return token;
}

/** Verify an admin MFA token */
export async function verifyAdminMfaToken(token: string): Promise<string | null> {
  if (!publicKey) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['EdDSA'],
      issuer: 'stellarity-central',
    });

    if (payload.type !== 'admin-mfa') return null;
    return payload.sub!;
  } catch {
    return null;
  }
}
