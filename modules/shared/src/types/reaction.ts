// ============================================================
// Reaction Types — Emoji reactions on messages
// ============================================================

/** A reaction on a message (aggregated) */
export interface MessageReaction {
  emoji: string;
  count: number;
  userIds: string[];
  me: boolean; // Whether the requesting user has reacted
}

/** A single reaction record */
export interface ReactionRecord {
  id: string;
  messageId: string;
  channelId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

/** Reaction event payload */
export interface ReactionPayload {
  messageId: string;
  channelId: string;
  serverId: string;
  userId: string;
  username: string;
  emoji: string;
}
