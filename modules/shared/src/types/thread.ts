// ============================================================
// Thread Types — Threaded conversations within channels
// ============================================================

/** A thread spawned from a message in a text channel */
export interface Thread {
  id: string;
  channelId: string;
  serverId: string;
  parentMessageId: string;
  name: string;
  creatorId: string;
  isArchived: boolean;
  isLocked: boolean; // Only mods can post when locked
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  archivedAt: string | null;
  creator?: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

/** Input for creating a thread */
export interface CreateThreadInput {
  channelId: string;
  parentMessageId: string;
  name: string;
}

/** Input for updating a thread */
export interface UpdateThreadInput {
  name?: string;
  isArchived?: boolean;
  isLocked?: boolean;
}

/** Thread message — same structure as Message but with threadId context */
export interface ThreadMessage {
  id: string;
  threadId: string;
  authorId: string;
  content: string;
  encrypted: boolean;
  editedAt: string | null;
  createdAt: string;
  attachments: any[];
  embeds: any[];
  replyToId: string | null;
  author?: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}
