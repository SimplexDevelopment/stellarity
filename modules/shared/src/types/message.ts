// ============================================================
// Message Types — Chat messages within instance channels
// ============================================================

import type { MemberUser } from './server.js';
import type { MessageReaction } from './reaction.js';

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  encrypted: boolean;
  editedAt: string | null;
  createdAt: string;
  attachments: MessageAttachment[];
  embeds: MessageEmbed[];
  replyToId: string | null;
  pinned: boolean;
  author?: MemberUser;
  reactions: MessageReaction[];
  threadId: string | null;
  threadCount: number | null;
  expiresAt: string | null;
  isEphemeral: boolean;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  size: number;
  url: string;
  contentType: string;
}

export interface MessageEmbed {
  type: 'link' | 'image' | 'video' | 'rich';
  title?: string;
  description?: string;
  url?: string;
  thumbnailUrl?: string;
  color?: string;
}

/** Pagination cursor for message history */
export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
  cursor: string | null;
}

/** Typing indicator state */
export interface TypingState {
  channelId: string;
  userId: string;
  username: string;
  startedAt: number;
}
