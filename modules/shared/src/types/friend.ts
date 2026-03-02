// ============================================================
// Friend Types — Cross-instance social graph (central server)
// ============================================================

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';

/** A friend relationship as seen by the requesting user */
export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
  friend: FriendUser;
}

/** Minimal user info for friend displays */
export interface FriendUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  statusMessage: string | null;
}

/** A pending friend request */
export interface FriendRequest {
  id: string;
  senderId: string;
  recipientId: string;
  message: string | null;
  createdAt: string;
  sender: FriendUser;
}

/** Friend activity — what a friend is doing */
export interface FriendActivity {
  userId: string;
  status: string;
  currentInstance: string | null;
  currentServer: string | null;
  lastSeenAt: string | null;
}
