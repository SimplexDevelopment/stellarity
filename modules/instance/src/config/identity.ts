/**
 * Instance Identity Manager
 * 
 * Manages the instance's Ed25519 keypair for identity verification.
 * On first run, generates a keypair and persists it to disk.
 * The public key is shared with the central server for discovery.
 * The private key never leaves the instance.
 */
import { generateKeyPair, exportSPKI, exportPKCS8, importSPKI, importPKCS8 } from 'jose';
import fs from 'fs/promises';
import path from 'path';
import { config } from './index.js';
import { logger } from '../utils/logger.js';

import type { InstanceIdentity, InstancePublicInfo } from '@stellarity/shared';

const IDENTITY_FILE = 'instance-identity.json';

let cachedIdentity: InstanceIdentity | null = null;

/** Get or create the instance identity */
export async function getInstanceIdentity(): Promise<InstanceIdentity> {
  if (cachedIdentity) return cachedIdentity;

  const dataDir = config.instance.dataDir;
  const identityPath = path.join(dataDir, IDENTITY_FILE);

  try {
    // Try to load existing identity
    await fs.mkdir(dataDir, { recursive: true });
    const data = await fs.readFile(identityPath, 'utf-8');
    cachedIdentity = JSON.parse(data) as InstanceIdentity;
    logger.info(`Instance identity loaded: ${cachedIdentity.instanceId}`);
    return cachedIdentity;
  } catch {
    // Generate new identity
    logger.info('No instance identity found, generating new keypair...');
    
    const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    
    const publicKeySpki = await exportSPKI(publicKey);
    const privateKeyPkcs8 = await exportPKCS8(privateKey);
    
    const instanceId = config.instance.id || crypto.randomUUID();

    cachedIdentity = {
      instanceId,
      publicKey: publicKeySpki,
      privateKey: privateKeyPkcs8,
    };

    await fs.writeFile(identityPath, JSON.stringify(cachedIdentity, null, 2), 'utf-8');
    logger.info(`New instance identity generated: ${instanceId}`);
    
    return cachedIdentity;
  }
}

/** Get instance public info for API responses */
export async function getInstancePublicInfo(): Promise<InstancePublicInfo> {
  const identity = await getInstanceIdentity();
  
  return {
    instanceId: identity.instanceId,
    name: config.instance.name,
    description: config.instance.description,
    publicKey: identity.publicKey,
    memberCount: 0, // TODO: fetch from DB
    maxMembers: config.instance.maxMembers,
    iconUrl: config.instance.iconUrl,
    region: config.instance.region,
    tags: config.instance.tags,
    version: '1.0.0',
  };
}

/** Import the instance's private key for signing */
export async function getInstancePrivateKey() {
  const identity = await getInstanceIdentity();
  return importPKCS8(identity.privateKey, 'EdDSA');
}

/** Import the instance's public key for verification */
export async function getInstancePublicKey() {
  const identity = await getInstanceIdentity();
  return importSPKI(identity.publicKey, 'EdDSA');
}
