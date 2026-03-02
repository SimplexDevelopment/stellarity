/**
 * Central JWT Verification for Instance Server
 * 
 * The instance server does NOT manage user accounts or passwords.
 * It verifies JWTs signed by the central server using Ed25519 (EdDSA).
 * The central server's public key is fetched once and cached.
 */
import { importSPKI, jwtVerify, type KeyLike } from 'jose';
import { config } from '../config/index.js';
import { logger } from './logger.js';

import type { TokenUser } from '@stellarity/shared';

let centralPublicKey: KeyLike | null = null;
let lastKeyFetch: number = 0;
const KEY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/** Fetch and cache the central server's public key */
async function getCentralPublicKey(): Promise<KeyLike> {
  const now = Date.now();
  
  if (centralPublicKey && (now - lastKeyFetch) < KEY_CACHE_TTL) {
    return centralPublicKey;
  }

  const keyUrl = config.central.publicKeyUrl || `${config.central.url}/api/auth/public-key`;
  
  try {
    logger.info(`Fetching central server public key from ${keyUrl}...`);
    const response = await fetch(keyUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch public key: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as { publicKey: string };
    centralPublicKey = await importSPKI(data.publicKey, 'EdDSA');
    lastKeyFetch = now;
    
    logger.info('Central server public key cached successfully');
    return centralPublicKey;
  } catch (error) {
    // If we have a cached key, use it even if expired
    if (centralPublicKey) {
      logger.warn('Failed to refresh central public key, using cached version:', error);
      return centralPublicKey;
    }
    
    throw new Error(`Cannot verify tokens: unable to fetch central server public key from ${keyUrl}`);
  }
}

/** Verify a JWT signed by the central server */
export async function verifyCentralToken(token: string): Promise<TokenUser | null> {
  try {
    const publicKey = await getCentralPublicKey();
    
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['EdDSA'],
    });
    
    // Validate required claims
    if (!payload.sub || !payload.username) {
      logger.warn('Token missing required claims (sub, username)');
      return null;
    }

    return {
      sub: payload.sub as string,
      username: payload.username as string,
      displayName: (payload.displayName as string) || null,
      avatarUrl: (payload.avatarUrl as string) || null,
      tier: (payload.tier as TokenUser['tier']) || 'free',
    };
  } catch (error) {
    logger.debug('Token verification failed:', error);
    return null;
  }
}

/** Force refresh the cached public key (e.g., on key rotation) */
export function invalidateCentralKeyCache(): void {
  centralPublicKey = null;
  lastKeyFetch = 0;
  logger.info('Central public key cache invalidated');
}

/**
 * Hash a string (for internal use like Redis keys).
 * This replaces the old hash() from encryption.ts for non-crypto purposes.
 */
export function hashString(input: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(input).digest('hex');
}
