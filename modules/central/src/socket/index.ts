/**
 * Central Server Socket Handler
 * 
 * Manages:
 * - Global user presence (online/offline across all instances)
 * - DM signaling (WebRTC data channel setup for P2P DMs)
 * - Pending DM notification (push to recipient when they come online)
 */
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken } from '../config/keys.js';
import { dmService } from '../services/dm.service.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { query } from '../database/postgres.js';

import type { TokenUser } from '@stellarity/shared';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

// Track online users: userId → Set<socketId>
const onlineUsers = new Map<string, Set<string>>();

let io: SocketIOServer;

export function initializeCentralSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 10000,
    path: '/central-ws',
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth?.token ||
                    socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const user = await verifyAccessToken(token);
      if (!user) {
        return next(new Error('Invalid token'));
      }

      socket.userId = user.sub;
      socket.username = user.username;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    const username = socket.username!;

    logger.info(`User connected to central: ${username} (${socket.id})`);

    // Track online status
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Update user status in DB
    updateUserStatus(userId, 'online');

    // Notify friends/contacts that user is online
    socket.broadcast.emit('user:status', { userId, status: 'online' });

    // Deliver pending DMs on connect
    deliverPendingDMs(socket, userId);

    // ── DM Signaling Events ────────────────────────────────────────

    /** Initiate a P2P DM connection */
    socket.on('dm:signal', (data: { peerId: string; signal: any }) => {
      const peerSockets = onlineUsers.get(data.peerId);
      if (peerSockets && peerSockets.size > 0) {
        // Forward signal to peer's first connected socket
        const peerSocketId = peerSockets.values().next().value;
        if (peerSocketId) {
          io.to(peerSocketId).emit('dm:signal', {
            peerId: userId,
            signal: data.signal,
          });
        }
      } else {
        // Peer is offline — tell sender to use buffer
        socket.emit('dm:peer-offline', { peerId: data.peerId });
      }
    });

    /** Check if a user is online (for DM routing decisions) */
    socket.on('dm:check-online', (data: { userId: string }, callback: (result: { online: boolean }) => void) => {
      const isOnline = onlineUsers.has(data.userId) && onlineUsers.get(data.userId)!.size > 0;
      if (typeof callback === 'function') {
        callback({ online: isOnline });
      }
    });

    /** New buffered DM notification — alert recipient in real-time */
    socket.on('dm:buffered', (data: { recipientId: string; messageId: string }) => {
      const recipientSockets = onlineUsers.get(data.recipientId);
      if (recipientSockets) {
        for (const socketId of recipientSockets) {
          io.to(socketId).emit('dm:new-buffered', {
            senderId: userId,
            messageId: data.messageId,
          });
        }
      }
    });

    // ── Presence Events ────────────────────────────────────────────

    /** Update user status */
    socket.on('presence:update', async (data: { status: 'online' | 'idle' | 'dnd' }) => {
      if (['online', 'idle', 'dnd'].includes(data.status)) {
        await updateUserStatus(userId, data.status);
        socket.broadcast.emit('user:status', { userId, status: data.status });
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────

    socket.on('disconnect', () => {
      logger.info(`User disconnected from central: ${username} (${socket.id})`);

      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          updateUserStatus(userId, 'offline');
          socket.broadcast.emit('user:status', { userId, status: 'offline' });
        }
      }
    });
  });

  logger.info('Central socket handler initialized');
  return io;
}

/** Update user status in the database */
async function updateUserStatus(userId: string, status: string): Promise<void> {
  try {
    await query(
      'UPDATE users SET status = $1, last_seen_at = NOW() WHERE id = $2',
      [status, userId]
    );
  } catch (error) {
    logger.error(`Failed to update user status: ${userId}`, error);
  }
}

/** Deliver any pending buffered DMs to a newly connected user */
async function deliverPendingDMs(socket: AuthenticatedSocket, userId: string): Promise<void> {
  try {
    const pending = await dmService.getPendingMessages(userId);
    if (pending.length > 0) {
      socket.emit('dm:pending', { messages: pending, count: pending.length });
      logger.debug(`Sent ${pending.length} pending DMs to ${socket.username}`);
    }
  } catch (error) {
    logger.error(`Failed to deliver pending DMs to ${userId}`, error);
  }
}

/** Check if a user is currently online */
export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0;
}

/** Get count of online users */
export function getOnlineUserCount(): number {
  return onlineUsers.size;
}

export { io };
