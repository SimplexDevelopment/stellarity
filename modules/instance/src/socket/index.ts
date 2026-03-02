import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyCentralToken } from '../utils/centralAuth.js';
import { presence } from '../database/redis.js';
import { voiceService } from '../services/voice.service.js';
import { serverService } from '../services/server.service.js';
import { moderationService } from '../services/moderation.service.js';
import { lobbyService } from '../services/lobby.service.js';
import { LIMITS } from '@stellarity/shared';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { setSocketServer } from './emitter.js';
import type { AuthenticatedSocket } from './types.js';
import { registerVoiceHandlers, handleVoiceLeave } from './voice.handler.js';
import { registerMessageHandlers } from './message.handler.js';
import { registerReactionHandlers, registerThreadHandlers, registerEncryptionHandlers, registerLobbyHandlers } from './feature.handler.js';

export function initializeSocket(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: config.cors.origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e6, // 1MB for voice data
  });

  // Register io instance for route-level event emission
  setSocketServer(io);
  
  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      const decoded = await verifyCentralToken(token);
      
      if (!decoded) {
        return next(new Error('Invalid token'));
      }
      
      socket.userId = decoded.sub;
      socket.username = decoded.username;
      socket.displayName = decoded.displayName || null;
      
      next();
    } catch (error) {
      logger.error('Socket auth error:', error);
      next(new Error('Authentication failed'));
    }
  });
  
  io.on('connection', async (socket: AuthenticatedSocket) => {
    logger.info(`User connected: ${socket.username} (${socket.userId})`);
    
    // Mark user as online
    await presence.setOnline(socket.userId!, socket.id);
    
    // Broadcast online status
    io.emit('presence:update', {
      userId: socket.userId,
      status: 'online',
    });
    
    // Join user's personal room for direct messages
    socket.join(`user:${socket.userId}`);
    
    // ── Server join/leave ────────────────────────────────────────────

    socket.on('server:join', async (serverId: string) => {
      try {
        if (moderationService.isUserBanned(serverId, socket.userId!)) {
          socket.emit('error', { message: 'You are banned from this server' });
          return;
        }
        
        const isMember = await serverService.isServerMember(serverId, socket.userId!);
        if (!isMember) {
          socket.emit('error', { message: 'Not a member of this server' });
          return;
        }
        
        socket.join(`server:${serverId}`);
        socket.currentServer = serverId;
        socket.emit('server:joined', { serverId });

        try {
          const occupancy = await voiceService.getServerVoiceOccupancy(serverId);
          socket.emit('voice:channel-occupancy', { serverId, channels: occupancy });
        } catch (occErr) {
          logger.error('Failed to send initial voice occupancy:', occErr);
        }
      } catch (error) {
        logger.error('Server join error:', error);
        socket.emit('error', { message: 'Failed to join server' });
      }
    });

    socket.on('server:leave', (serverId: string) => {
      socket.leave(`server:${serverId}`);
      if (socket.currentServer === serverId) {
        socket.currentServer = undefined;
      }
    });

    // ── Register domain-specific handlers ────────────────────────────

    registerVoiceHandlers(io, socket);
    registerMessageHandlers(io, socket);
    registerReactionHandlers(io, socket);
    registerThreadHandlers(io, socket);
    registerEncryptionHandlers(io, socket);
    registerLobbyHandlers(io, socket);

    // ── Disconnect ───────────────────────────────────────────────────

    socket.on('disconnect', async (reason) => {
      logger.info(`User disconnected: ${socket.username} (${reason})`);
      
      // Reuse shared voice-leave logic (host migration, lobby cleanup, etc.)
      await handleVoiceLeave(io, socket);
      
      // Mark user as offline
      await presence.setOffline(socket.userId!);
      
      // Broadcast offline status
      io.emit('presence:update', {
        userId: socket.userId,
        status: 'offline',
      });
    });
    
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${socket.username}:`, error);
    });
  });
  
  // Periodic cleanup of stale connections
  setInterval(async () => {
    const connectedSockets = await io.fetchSockets();
    const connectedUserIds = connectedSockets
      .map((s) => (s as unknown as AuthenticatedSocket).userId)
      .filter(Boolean) as string[];
    
    await voiceService.cleanupDisconnectedUsers(connectedUserIds);
  }, 60000);
  
  // Periodic expiry of timed moderation actions (mutes, timeouts)
  setInterval(() => {
    moderationService.expireActions();
  }, 30000);

  // Periodic cleanup of empty temporary lobbies
  setInterval(() => {
    lobbyService.checkAndCleanupEmptyLobbies();
  }, LIMITS.LOBBY_CLEANUP_INTERVAL_MS);
  
  logger.info('Socket.IO initialized');
  
  return io;
}
