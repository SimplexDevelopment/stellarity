/**
 * Friend Service
 * 
 * Manages cross-instance friend relationships on the central server.
 * Friends can see each other's online status and what instance they're on.
 */
import { query } from '../database/postgres.js';
import { logger } from '../utils/logger.js';
import { LIMITS, NotFoundError, ConflictError, BadRequestError, ForbiddenError, RateLimitError } from '@stellarity/shared';

export interface FriendshipRow {
  id: string;
  requesterId: string;
  recipientId: string;
  status: 'pending' | 'accepted' | 'blocked';
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FriendEntry {
  friendshipId: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string | null;
  onlineStatus: string;
  since: string;
}

export interface FriendRequestEntry {
  friendshipId: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  message: string | null;
  createdAt: string;
}

export interface BlockedUserEntry {
  friendshipId: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
}

function mapFriendship(row: any): FriendshipRow {
  return {
    id: row.id,
    requesterId: row.requester_id,
    recipientId: row.recipient_id,
    status: row.status,
    message: row.message || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class FriendService {
  /** Send a friend request */
  async sendRequest(requesterId: string, recipientUsername: string, message?: string): Promise<FriendshipRow> {
    // Look up recipient by username
    const recipientResult = await query(
      'SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)',
      [recipientUsername]
    );
    if (recipientResult.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    const recipientId = recipientResult.rows[0].id;

    if (requesterId === recipientId) {
      throw new BadRequestError('Cannot send a friend request to yourself');
    }

    // Check if already friends or request pending
    const existing = await query(
      `SELECT id, status FROM friendships
       WHERE (requester_id = $1 AND recipient_id = $2)
          OR (requester_id = $2 AND recipient_id = $1)`,
      [requesterId, recipientId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.status === 'accepted') throw new ConflictError('Already friends');
      if (row.status === 'pending') throw new ConflictError('Friend request already pending');
      if (row.status === 'blocked') throw new ForbiddenError('Unable to send friend request');
    }

    // Check friend count limit for requester
    const friendCount = await query(
      `SELECT COUNT(*) FROM friendships WHERE (requester_id = $1 OR recipient_id = $1) AND status = 'accepted'`,
      [requesterId]
    );
    if (parseInt(friendCount.rows[0].count, 10) >= LIMITS.FRIENDS_MAX) {
      throw new RateLimitError(`Maximum ${LIMITS.FRIENDS_MAX} friends allowed`);
    }

    // Check pending request limit
    const pendingCount = await query(
      `SELECT COUNT(*) FROM friendships WHERE requester_id = $1 AND status = 'pending'`,
      [requesterId]
    );
    if (parseInt(pendingCount.rows[0].count, 10) >= LIMITS.FRIEND_REQUESTS_MAX) {
      throw new RateLimitError(`Maximum ${LIMITS.FRIEND_REQUESTS_MAX} pending requests allowed`);
    }

    const result = await query(
      `INSERT INTO friendships (requester_id, recipient_id, status, message)
       VALUES ($1, $2, 'pending', $3)
       RETURNING *`,
      [requesterId, recipientId, message || null]
    );

    logger.info(`Friend request sent from ${requesterId} to ${recipientId}`);
    return mapFriendship(result.rows[0]);
  }

  /** Accept a friend request */
  async acceptRequest(friendshipId: string, userId: string): Promise<FriendshipRow> {
    const result = await query(
      `UPDATE friendships
       SET status = 'accepted', updated_at = NOW()
       WHERE id = $1 AND recipient_id = $2 AND status = 'pending'
       RETURNING *`,
      [friendshipId, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Friend request not found or already handled');
    }

    logger.info(`Friend request ${friendshipId} accepted by ${userId}`);
    return mapFriendship(result.rows[0]);
  }

  /** Reject a friend request */
  async rejectRequest(friendshipId: string, userId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM friendships WHERE id = $1 AND recipient_id = $2 AND status = 'pending'`,
      [friendshipId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Remove a friend (either party can unfriend) */
  async removeFriend(friendshipId: string, userId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM friendships
       WHERE id = $1 AND (requester_id = $2 OR recipient_id = $2) AND status = 'accepted'`,
      [friendshipId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Block a user */
  async blockUser(blockerId: string, blockedUserId: string): Promise<FriendshipRow> {
    if (blockerId === blockedUserId) {
      throw new BadRequestError('Cannot block yourself');
    }

    // Remove any existing friendship first
    await query(
      `DELETE FROM friendships
       WHERE (requester_id = $1 AND recipient_id = $2)
          OR (requester_id = $2 AND recipient_id = $1)`,
      [blockerId, blockedUserId]
    );

    // Insert a block record
    const result = await query(
      `INSERT INTO friendships (requester_id, recipient_id, status)
       VALUES ($1, $2, 'blocked')
       ON CONFLICT ON CONSTRAINT unique_friendship DO UPDATE SET status = 'blocked', updated_at = NOW()
       RETURNING *`,
      [blockerId, blockedUserId]
    );

    logger.info(`User ${blockerId} blocked ${blockedUserId}`);
    return mapFriendship(result.rows[0]);
  }

  /** Unblock a user */
  async unblockUser(blockerId: string, blockedUserId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM friendships WHERE requester_id = $1 AND recipient_id = $2 AND status = 'blocked'`,
      [blockerId, blockedUserId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Get all friends for a user (accepted) */
  async getFriends(userId: string): Promise<FriendEntry[]> {
    const result = await query(
      `SELECT f.*, 
              u.username, u.display_name, u.avatar_url, u.status
       FROM friendships f
       JOIN users u ON u.id = CASE
         WHEN f.requester_id = $1 THEN f.recipient_id
         ELSE f.requester_id
       END
       WHERE (f.requester_id = $1 OR f.recipient_id = $1) AND f.status = 'accepted'
       ORDER BY u.username`,
      [userId]
    );

    return result.rows.map(row => ({
      friendshipId: row.id,
      userId: row.requester_id === userId ? row.recipient_id : row.requester_id,
      username: row.username,
      displayName: row.display_name || null,
      avatarUrl: row.avatar_url || null,
      status: row.status === 'accepted' ? (row as any).status : null,
      onlineStatus: (row as any).status, // user's presence status
      since: row.updated_at || row.created_at,
    }));
  }

  /** Get only the user IDs of accepted friends (lightweight for presence broadcasts) */
  async getFriendIds(userId: string): Promise<string[]> {
    const result = await query(
      `SELECT CASE WHEN requester_id = $1 THEN recipient_id ELSE requester_id END AS friend_id
       FROM friendships
       WHERE (requester_id = $1 OR recipient_id = $1) AND status = 'accepted'`,
      [userId]
    );
    return result.rows.map((row: any) => row.friend_id);
  }

  /** Get pending friend requests for a user (incoming) */
  async getIncomingRequests(userId: string): Promise<FriendRequestEntry[]> {
    const result = await query(
      `SELECT f.*, u.username, u.display_name, u.avatar_url
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.recipient_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      friendshipId: row.id,
      userId: row.requester_id,
      username: row.username,
      displayName: row.display_name || null,
      avatarUrl: row.avatar_url || null,
      message: row.message || null,
      createdAt: row.created_at,
    }));
  }

  /** Get outgoing friend requests */
  async getOutgoingRequests(userId: string): Promise<FriendRequestEntry[]> {
    const result = await query(
      `SELECT f.*, u.username, u.display_name, u.avatar_url
       FROM friendships f
       JOIN users u ON u.id = f.recipient_id
       WHERE f.requester_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      friendshipId: row.id,
      userId: row.recipient_id,
      username: row.username,
      displayName: row.display_name || null,
      avatarUrl: row.avatar_url || null,
      message: row.message || null,
      createdAt: row.created_at,
    }));
  }

  /** Get blocked users */
  async getBlockedUsers(userId: string): Promise<BlockedUserEntry[]> {
    const result = await query(
      `SELECT f.*, u.username, u.display_name, u.avatar_url
       FROM friendships f
       JOIN users u ON u.id = f.recipient_id
       WHERE f.requester_id = $1 AND f.status = 'blocked'
       ORDER BY f.updated_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      friendshipId: row.id,
      userId: row.recipient_id,
      username: row.username,
      displayName: row.display_name || null,
      avatarUrl: row.avatar_url || null,
      blockedAt: row.updated_at || row.created_at,
    }));
  }

  /** Check if two users are friends */
  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const result = await query(
      `SELECT id FROM friendships
       WHERE ((requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1))
         AND status = 'accepted'`,
      [userId1, userId2]
    );
    return result.rows.length > 0;
  }

  /** Check if a user is blocked by another */
  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await query(
      `SELECT id FROM friendships
       WHERE requester_id = $1 AND recipient_id = $2 AND status = 'blocked'`,
      [blockerId, blockedId]
    );
    return result.rows.length > 0;
  }
}

export const friendService = new FriendService();
