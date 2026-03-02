// ============================================================
// Instance Types — Self-hosted instance server identity
// ============================================================

/** Instance info as stored in the central discovery registry */
export interface InstanceInfo {
  id: string;
  name: string;
  description: string | null;
  url: string;
  publicKey: string; // Instance's Ed25519 public key (base64)
  ownerId: string;
  isPublic: boolean;
  isVerified: boolean;
  tags: string[];
  region: string | null;
  memberCount: number;
  maxMembers: number;
  iconUrl: string | null;
  createdAt: string;
  lastHeartbeatAt: string | null;
}

/** Instance config stored locally on the instance server */
export interface InstanceConfig {
  instanceId: string;
  instanceName: string;
  description: string | null;
  centralServerUrl: string;
  isPublic: boolean;
  region: string | null;
  tags: string[];
  maxMembers: number;
  iconUrl: string | null;
}

/** Instance identity keypair (private key only on instance) */
export interface InstanceIdentity {
  instanceId: string;
  publicKey: string; // Ed25519 public key (base64)
  privateKey: string; // Ed25519 private key (base64) — never leaves the instance
}

/** What the instance returns at GET /api/instance/info */
export interface InstancePublicInfo {
  instanceId: string;
  name: string;
  description: string | null;
  publicKey: string;
  memberCount: number;
  maxMembers: number;
  iconUrl: string | null;
  region: string | null;
  tags: string[];
  version: string;
}

/** Connection state for an instance from the client's perspective */
export interface InstanceConnection {
  url: string;
  info: InstancePublicInfo | null;
  status: InstanceConnectionStatus;
  latency: number | null;
  connectedAt: string | null;
  error: string | null;
}

export type InstanceConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'error'
  | 'reconnecting';
