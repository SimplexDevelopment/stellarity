// ============================================================
// Ephemeral & Scheduled Message Types
// ============================================================

/** Duration presets for ephemeral messages */
export type EphemeralDuration =
  | 30        // 30 seconds
  | 300       // 5 minutes
  | 3600      // 1 hour
  | 86400     // 24 hours
  | 604800;   // 7 days

/** A scheduled message awaiting delivery */
export interface ScheduledMessage {
  id: string;
  channelId: string;
  serverId: string;
  userId: string;
  content: string;
  encrypted: boolean;
  scheduledFor: string; // ISO-8601
  createdAt: string;
  status: ScheduledMessageStatus;
  replyToId: string | null;
  author?: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export type ScheduledMessageStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

/** Input for creating a scheduled message */
export interface CreateScheduledMessageInput {
  channelId: string;
  content: string;
  scheduledFor: string; // ISO-8601 timestamp
  encrypted?: boolean;
  replyToId?: string;
}

/** Input for creating an ephemeral message */
export interface CreateEphemeralMessageInput {
  channelId: string;
  content: string;
  ttlSeconds: number; // Time-to-live in seconds
  encrypted?: boolean;
  replyToId?: string;
}
