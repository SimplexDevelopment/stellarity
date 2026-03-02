/**
 * Panel Authentication — Local Passphrase
 *
 * The instance management panel uses a local admin passphrase for authentication.
 * This keeps the panel fully self-contained with no central server dependency.
 *
 * Passphrase resolution:
 *   1. If PANEL_PASSWORD env var is set, it is used (hashed and persisted)
 *   2. If data/panel-credentials.json exists, it is loaded
 *   3. Otherwise, no credentials exist — the panel enters "setup" mode
 *      where the user is prompted to choose their own passphrase
 *
 * Hashing uses Node.js built-in crypto.scrypt (no additional dependencies).
 * Panel sessions are JWT tokens signed with the instance's Ed25519 private key.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config/index.js';
import { getInstancePrivateKey, getInstancePublicKey, getInstanceIdentity } from '../config/identity.js';
import { logger } from '../utils/logger.js';

const CREDENTIALS_FILE = 'panel-credentials.json';
const PANEL_JWT_ISSUER = 'stellarity-panel';
const PANEL_JWT_AUDIENCE = 'instance-panel';

interface PanelCredentials {
  passwordHash: string;
  salt: string;
  createdAt: string;
}

let cachedCredentials: PanelCredentials | null = null;

// ── Passphrase Hashing ──────────────────────────────────────────────

/** Hash a passphrase with scrypt */
function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('hex'));
    });
  });
}

// ── Credential Management ──────────────────────────────────────────

/** Check if panel credentials have been configured */
export async function needsSetup(): Promise<boolean> {
  // If PANEL_PASSWORD env var is set, setup is not needed
  if (config.panel.password) return false;

  const dataDir = config.instance.dataDir;
  const credPath = path.join(dataDir, CREDENTIALS_FILE);

  try {
    await fs.access(credPath);
    return false; // File exists — credentials are set
  } catch {
    return true; // No credentials file — needs setup
  }
}

/** Set up initial passphrase (first-time setup only) */
export async function setupPassphrase(passphrase: string): Promise<void> {
  const isSetup = await needsSetup();
  if (!isSetup) {
    throw new Error('Passphrase has already been configured');
  }

  const salt = crypto.randomBytes(32).toString('hex');
  const hash = await hashPassword(passphrase, salt);
  const credentials: PanelCredentials = { passwordHash: hash, salt, createdAt: new Date().toISOString() };

  const dataDir = config.instance.dataDir;
  const credPath = path.join(dataDir, CREDENTIALS_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(credPath, JSON.stringify(credentials, null, 2), 'utf-8');

  cachedCredentials = credentials;
  logger.info('Panel passphrase configured by user');
}

/** Change passphrase (requires current passphrase for verification) */
export async function changePassphrase(currentPassphrase: string, newPassphrase: string): Promise<void> {
  const valid = await verifyPassphrase(currentPassphrase);
  if (!valid) {
    throw new Error('Current passphrase is incorrect');
  }

  const salt = crypto.randomBytes(32).toString('hex');
  const hash = await hashPassword(newPassphrase, salt);
  const credentials: PanelCredentials = { passwordHash: hash, salt, createdAt: new Date().toISOString() };

  const dataDir = config.instance.dataDir;
  const credPath = path.join(dataDir, CREDENTIALS_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(credPath, JSON.stringify(credentials, null, 2), 'utf-8');

  cachedCredentials = credentials;
  logger.info('Panel passphrase changed');
}

/** Load panel credentials from env var or disk. Returns null if not yet configured. */
async function getCredentials(): Promise<PanelCredentials | null> {
  if (cachedCredentials) return cachedCredentials;

  const dataDir = config.instance.dataDir;
  const credPath = path.join(dataDir, CREDENTIALS_FILE);

  // If PANEL_PASSWORD env var is set, always use it (hash on the fly)
  if (config.panel.password) {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = await hashPassword(config.panel.password, salt);
    cachedCredentials = { passwordHash: hash, salt, createdAt: new Date().toISOString() };

    // Persist so subsequent runs without the env var still work
    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(credPath, JSON.stringify(cachedCredentials, null, 2), 'utf-8');
    } catch {
      // Non-fatal — credentials will be re-derived from env var
    }

    return cachedCredentials;
  }

  // Try loading existing credentials from disk
  try {
    const data = await fs.readFile(credPath, 'utf-8');
    cachedCredentials = JSON.parse(data) as PanelCredentials;
    logger.info('Panel credentials loaded from disk');
    return cachedCredentials;
  } catch {
    // No credentials on disk — panel needs setup
    return null;
  }
}

// ── Authentication ─────────────────────────────────────────────────

/** Verify a passphrase against stored credentials */
export async function verifyPassphrase(passphrase: string): Promise<boolean> {
  const credentials = await getCredentials();
  if (!credentials) return false; // No credentials set — can't verify

  const hash = await hashPassword(passphrase, credentials.salt);
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(credentials.passwordHash, 'hex')
  );
}

/** Issue a panel session JWT */
export async function issueSessionToken(): Promise<string> {
  const privateKey = await getInstancePrivateKey();
  const identity = await getInstanceIdentity();

  const token = await new SignJWT({
    role: 'panel-admin',
    instanceId: identity.instanceId,
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer(PANEL_JWT_ISSUER)
    .setAudience(PANEL_JWT_AUDIENCE)
    .setSubject('panel-admin')
    .setIssuedAt()
    .setExpirationTime(`${config.panel.sessionDuration}s`)
    .sign(privateKey);

  return token;
}

/** Verify a panel session JWT */
export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const publicKey = await getInstancePublicKey();
    await jwtVerify(token, publicKey, {
      issuer: PANEL_JWT_ISSUER,
      audience: PANEL_JWT_AUDIENCE,
    });
    return true;
  } catch {
    return false;
  }
}

/** Initialize panel auth (called on startup) */
export async function initializePanelAuth(): Promise<void> {
  const setup = await needsSetup();
  if (setup) {
    logger.info('');
    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║           INSTANCE MANAGEMENT PANEL                     ║');
    logger.info('║                                                         ║');
    logger.info('║   No passphrase configured yet.                         ║');
    logger.info('║   Open the panel in your browser to set one up.         ║');
    logger.info('║                                                         ║');
    logger.info('║   Or set PANEL_PASSWORD env var before starting.        ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
  } else {
    await getCredentials();
  }
}
