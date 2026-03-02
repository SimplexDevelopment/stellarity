// ============================================================
// DM Types — Peer-to-peer direct messages with central fallback
// ============================================================

import type { PublicUser } from './auth.js';

/** A direct message between two users */
export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  contentEncrypted: boolean;
  deliveryStatus: DMDeliveryStatus;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export type DMDeliveryStatus =
  | 'sending'     // Client is attempting to send
  | 'sent_p2p'    // Delivered directly via WebRTC data channel
  | 'buffered'    // Stored on central server (recipient offline)
  | 'delivered'   // Confirmed delivered to recipient
  | 'read'        // Recipient has read the message
  | 'failed';     // Delivery failed

/** A DM conversation between two users */
export interface DMConversation {
  id: string;
  participants: [PublicUser, PublicUser];
  lastMessage: DirectMessage | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

/** Pending DM from the central buffer */
export interface PendingDM {
  id: string;
  senderId: string;
  senderUsername: string;
  contentEncrypted: string; // Base64-encoded encrypted content
  createdAt: string;
  expiresAt: string;
}

/** DM signaling for WebRTC data channel setup */
export interface DMSignal {
  peerId: string;
  signal: {
    type: 'offer' | 'answer' | 'candidate';
    sdp?: string;
    candidate?: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
  };
}
