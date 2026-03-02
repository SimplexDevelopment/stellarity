import crypto from 'crypto';
import { config } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;

// Ensure key is exactly 32 bytes for AES-256
function getKey(keyString: string): Buffer {
  // Hash the key to ensure it's exactly 32 bytes
  return crypto.createHash('sha256').update(keyString).digest();
}

// Encrypt data using AES-256-GCM
export function encrypt(plaintext: string, customKey?: string): string {
  const key = getKey(customKey || config.encryption.key);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV + Auth Tag + Encrypted data
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64'),
  ]);
  
  return combined.toString('base64');
}

// Decrypt data using AES-256-GCM
export function decrypt(ciphertext: string, customKey?: string): string {
  const key = getKey(customKey || config.encryption.key);
  const combined = Buffer.from(ciphertext, 'base64');
  
  // Extract IV, Auth Tag, and encrypted data
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Encrypt binary data (for voice)
export function encryptBuffer(data: Buffer, customKey?: string): Buffer {
  const key = getKey(customKey || config.encryption.voiceKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  
  const encrypted = Buffer.concat([
    cipher.update(data),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV + Auth Tag + Encrypted data
  return Buffer.concat([iv, authTag, encrypted]);
}

// Decrypt binary data (for voice)
export function decryptBuffer(encryptedData: Buffer, customKey?: string): Buffer {
  const key = getKey(customKey || config.encryption.voiceKey);
  
  // Extract IV, Auth Tag, and encrypted data
  const iv = encryptedData.subarray(0, IV_LENGTH);
  const authTag = encryptedData.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = encryptedData.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
}

// Generate a secure random channel encryption key
export function generateChannelKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

// Derive a key from password for E2E encryption
export function deriveKey(password: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
  const useSalt = salt || crypto.randomBytes(SALT_LENGTH);
  const key = crypto.pbkdf2Sync(password, useSalt, 100000, 32, 'sha256');
  return { key, salt: useSalt };
}

// Generate secure random token
export function generateToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// Generate invite code
export function generateInviteCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
}

// Hash data (for token storage)
export function hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// HMAC for message authentication
export function createHmac(data: string, secret?: string): string {
  return crypto
    .createHmac('sha256', secret || config.encryption.key)
    .update(data)
    .digest('hex');
}

// Verify HMAC
export function verifyHmac(data: string, hmac: string, secret?: string): boolean {
  const computed = createHmac(data, secret);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmac));
}
