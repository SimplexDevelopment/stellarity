// ============================================================
// E2E Encryption Types — End-to-end encrypted text channels
// ============================================================

/** A channel's encryption configuration */
export interface ChannelEncryption {
  channelId: string;
  enabled: boolean;
  algorithm: 'aes-256-gcm';
  /** Public keys of all members who have registered for this channel */
  memberKeys: ChannelMemberKey[];
  rotatedAt: string | null;
}

/** A member's public key for a specific encrypted channel */
export interface ChannelMemberKey {
  userId: string;
  publicKey: string; // Base64-encoded X25519 public key
  registeredAt: string;
}

/** Key exchange request — sent when joining an encrypted channel */
export interface KeyExchangeRequest {
  channelId: string;
  publicKey: string; // Sender's ephemeral X25519 public key
}

/** Encrypted channel key bundle — distributed to new members */
export interface EncryptedKeyBundle {
  channelId: string;
  senderUserId: string;
  recipientUserId: string;
  encryptedChannelKey: string; // Channel symmetric key encrypted with recipient's public key
  nonce: string;
  createdAt: string;
}
