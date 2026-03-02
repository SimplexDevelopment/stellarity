import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyCentralToken } from '../utils/centralAuth.js';
import { presence, voiceChannels } from '../database/redis.js';
import { voiceService } from '../services/voice.service.js';
import { serverService } from '../services/server.service.js';
import { messageService } from '../services/message.service.js';
import { moderationService } from '../services/moderation.service.js';
import { lobbyService } from '../services/lobby.service.js';
import { LIMITS } from '@stellarity/shared';
import { encryptBuffer, decryptBuffer } from '../utils/encryption.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { setSocketServer } from './emitter.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  currentChannel?: string;
  currentServer?: string;
}

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
    
    // Handle joining a server room
    socket.on('server:join', async (serverId: string) => {
      try {
        // Check if user is banned from this server
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

        // Send initial voice channel occupancy for Ventrilo-style sidebar
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
    
    // Handle leaving a server room
    socket.on('server:leave', (serverId: string) => {
      socket.leave(`server:${serverId}`);
      if (socket.currentServer === serverId) {
        socket.currentServer = undefined;
      }
    });
    
    // Handle joining a voice channel
    socket.on('voice:join', async ({ channelId, serverId }) => {
      try {
        const isMember = await serverService.isServerMember(serverId, socket.userId!);
        if (!isMember) {
          socket.emit('error', { message: 'Not a member of this server' });
          return;
        }
        
        // Leave current channel if in one
        if (socket.currentChannel) {
          socket.leave(`voice:${socket.currentChannel}`);
          io.to(`voice:${socket.currentChannel}`).emit('voice:user-left', {
            userId: socket.userId,
            username: socket.username,
          });
        }

        let actualChannelId = channelId;

        // Auto-overflow: if channel is full and auto-overflow is enabled, redirect to overflow lobby
        try {
          const { users, channelKey, hostUserId, isHost } = await voiceService.joinChannel(
            socket.userId!,
            actualChannelId,
            serverId
          );

          socket.currentChannel = actualChannelId;
          socket.join(`voice:${actualChannelId}`);
        
          // Notify others in the voice channel room
          socket.to(`voice:${actualChannelId}`).emit('voice:user-joined', {
            userId: socket.userId,
            username: socket.username,
          });
        
          // Send channel info to joining user
          socket.emit('voice:joined', {
            channelId: actualChannelId,
            users,
            channelKey,
            hostUserId,
            isHost,
          });
        
          // Notify server members of voice state
          io.to(`server:${serverId}`).emit('voice:state-update', {
            userId: socket.userId,
            channelId: actualChannelId,
          });

          // Broadcast user joined to server room for Ventrilo-style sidebar
          const joinedChannelUsers = await voiceService.getChannelUsers(actualChannelId);
          io.to(`server:${serverId}`).emit('voice:user-joined-channel', {
            channelId: actualChannelId,
            user: {
              userId: socket.userId,
              username: socket.username,
              displayName: null,
              avatarUrl: null,
              selfMute: false,
              selfDeaf: false,
            },
            userCount: joinedChannelUsers.length,
          });
        } catch (joinError: any) {
          // Auto-overflow: if channel is full and overflow is enabled, create overflow lobby
          if (joinError.message === 'Voice channel is full') {
            const features = lobbyService.getServerFeatures(serverId);
            if (features.autoOverflowEnabled) {
              try {
                const overflowChannel = await lobbyService.createOverflowLobby(serverId, channelId);
                io.to(`server:${serverId}`).emit('lobby:created', { channel: overflowChannel });
                io.to(`server:${serverId}`).emit('channel:created', { channel: overflowChannel });

                // Now join the overflow channel
                const overflowResult = await voiceService.joinChannel(
                  socket.userId!,
                  overflowChannel.id,
                  serverId
                );

                socket.currentChannel = overflowChannel.id;
                socket.join(`voice:${overflowChannel.id}`);

                socket.emit('voice:joined', {
                  channelId: overflowChannel.id,
                  users: overflowResult.users,
                  channelKey: overflowResult.channelKey,
                  hostUserId: overflowResult.hostUserId,
                  isHost: overflowResult.isHost,
                });

                io.to(`server:${serverId}`).emit('voice:state-update', {
                  userId: socket.userId,
                  channelId: overflowChannel.id,
                });

                io.to(`server:${serverId}`).emit('voice:user-joined-channel', {
                  channelId: overflowChannel.id,
                  user: {
                    userId: socket.userId,
                    username: socket.username,
                    displayName: null,
                    avatarUrl: null,
                    selfMute: false,
                    selfDeaf: false,
                  },
                  userCount: 1,
                });
                return;
              } catch (overflowError: any) {
                logger.error('Auto-overflow error:', overflowError);
              }
            }
          }
          throw joinError;
        }
      } catch (error: any) {
        logger.error('Voice join error:', error);
        socket.emit('error', { message: error.message });
      }
    });
    
    // Handle leaving voice channel
    socket.on('voice:leave', async () => {
      if (socket.currentChannel) {
        const channelId = socket.currentChannel;
        const serverId = socket.currentServer;
        const { newHostId } = await voiceService.leaveChannel(socket.userId!);
        
        socket.leave(`voice:${channelId}`);
        socket.currentChannel = undefined;
        
        io.to(`voice:${channelId}`).emit('voice:user-left', {
          userId: socket.userId,
          username: socket.username,
        });
        
        // Notify about host migration if needed
        if (newHostId) {
          io.to(`voice:${channelId}`).emit('voice:host-changed', {
            hostUserId: newHostId,
          });
        }
        
        if (serverId) {
          io.to(`server:${serverId}`).emit('voice:state-update', {
            userId: socket.userId,
            channelId: null,
          });

          // Broadcast user left to server room for Ventrilo-style sidebar
          const remainingUsers = await voiceService.getChannelUsers(channelId);
          io.to(`server:${serverId}`).emit('voice:user-left-channel', {
            channelId,
            userId: socket.userId,
            userCount: remainingUsers.length,
          });

          // Clean up empty temporary lobbies
          try {
            const channel = await serverService.getChannelById(channelId);
            if (channel && channel.isTemporary && channel.expiresWhenEmpty && remainingUsers.length === 0) {
              const destroyed = await lobbyService.destroyLobby(channelId);
              if (destroyed) {
                io.to(`server:${serverId}`).emit('lobby:destroyed', { channelId, serverId });
                io.to(`server:${serverId}`).emit('channel:deleted', { channelId, serverId });
              }
            }
          } catch (err) {
            logger.error('Lobby cleanup on leave error:', err);
          }
        }
        
        socket.emit('voice:left');
      }
    });
    
    // Handle voice state updates (mute/deaf)
    socket.on('voice:state', async ({ selfMute, selfDeaf }) => {
      try {
        await voiceService.updateVoiceState(socket.userId!, { selfMute, selfDeaf });
        
        if (socket.currentChannel) {
          io.to(`voice:${socket.currentChannel}`).emit('voice:state-update', {
            userId: socket.userId,
            selfMute,
            selfDeaf,
          });
        }
      } catch (error) {
        logger.error('Voice state update error:', error);
      }
    });
    
    // Handle voice data (WebRTC signaling)
    socket.on('voice:signal', ({ targetUserId, signal }) => {
      io.to(`user:${targetUserId}`).emit('voice:signal', {
        fromUserId: socket.userId,
        signal,
      });
    });
    
    // Handle encrypted voice data relay (for server-mediated voice)
    socket.on('voice:data', (encryptedData: Buffer) => {
      if (socket.currentChannel) {
        // Relay encrypted voice data to other users in the channel
        socket.to(`voice:${socket.currentChannel}`).emit('voice:data', {
          fromUserId: socket.userId,
          data: encryptedData,
        });
      }
    });
    
    // Handle speaking indicator
    socket.on('voice:speaking', (speaking: boolean) => {
      if (socket.currentChannel) {
        socket.to(`voice:${socket.currentChannel}`).emit('voice:speaking', {
          userId: socket.userId,
          speaking,
        });
      }
    });
    
    // Handle connection quality update
    socket.on('voice:quality', async ({ quality }) => {
      if (socket.currentChannel) {
        await voiceService.updateConnectionQuality(socket.currentChannel, socket.userId!, quality);
        
        // Broadcast quality update to channel
        io.to(`voice:${socket.currentChannel}`).emit('voice:quality-update', {
          userId: socket.userId,
          quality,
        });
      }
    });
    
    // Handle request for host migration (if current host has issues)
    socket.on('voice:request-host-migration', async () => {
      if (socket.currentChannel) {
        const newHost = await voiceService.forceHostMigration(socket.currentChannel);
        if (newHost) {
          io.to(`voice:${socket.currentChannel}`).emit('voice:host-changed', {
            hostUserId: newHost,
          });
        }
      }
    });
    
    // Handle typing indicator
    socket.on('typing:start', ({ channelId }) => {
      socket.to(`server:${socket.currentServer}`).emit('typing:start', {
        channelId,
        userId: socket.userId,
        username: socket.username,
      });
    });
    
    socket.on('typing:stop', ({ channelId }) => {
      socket.to(`server:${socket.currentServer}`).emit('typing:stop', {
        channelId,
        userId: socket.userId,
      });
    });

    // Handle real-time messaging via socket (alternative to REST)
    socket.on('message:send', async ({ channelId, content, encrypted, replyToId }) => {
      try {
        // Verify user has access to channel
        const channel = await serverService.getChannel(channelId);
        if (!channel) {
          socket.emit('error', { message: 'Channel not found' });
          return;
        }

        const isMember = await serverService.isServerMember(channel.serverId, socket.userId!);
        if (!isMember) {
          socket.emit('error', { message: 'You do not have access to this channel' });
          return;
        }

        // Check if user is muted or timed out
        if (moderationService.isUserMuted(channel.serverId, socket.userId!)) {
          socket.emit('error', { message: 'You are muted in this server' });
          return;
        }

        // Create the message
        const message = await messageService.createMessage({
          channelId,
          userId: socket.userId!,
          content,
          encrypted: encrypted || false,
          replyToId,
        });

        // Broadcast to all users in the server
        io.to(`server:${channel.serverId}`).emit('message:new', {
          ...message,
          author: {
            id: socket.userId,
            username: socket.username,
          },
        });
      } catch (error: any) {
        logger.error('Message send error:', error);
        socket.emit('error', { message: error.message || 'Failed to send message' });
      }
    });

    // Handle message edit
    socket.on('message:edit', async ({ messageId, content }) => {
      try {
        const message = await messageService.editMessage(messageId, socket.userId!, content);
        if (!message) {
          socket.emit('error', { message: 'Message not found or cannot be edited' });
          return;
        }

        const channel = await serverService.getChannel(message.channelId);
        if (channel) {
          io.to(`server:${channel.serverId}`).emit('message:updated', message);
        }
      } catch (error: any) {
        logger.error('Message edit error:', error);
        socket.emit('error', { message: error.message || 'Failed to edit message' });
      }
    });

    // Handle message delete
    socket.on('message:delete', async ({ messageId, channelId }) => {
      try {
        const channel = await serverService.getChannel(channelId);
        if (!channel) {
          socket.emit('error', { message: 'Channel not found' });
          return;
        }

        const isOwner = await serverService.isServerOwner(channel.serverId, socket.userId!);
        const deleted = await messageService.deleteMessage(messageId, socket.userId!, isOwner);
        
        if (!deleted) {
          socket.emit('error', { message: 'Message not found or cannot be deleted' });
          return;
        }

        io.to(`server:${channel.serverId}`).emit('message:deleted', {
          messageId,
          channelId,
        });
      } catch (error: any) {
        logger.error('Message delete error:', error);
        socket.emit('error', { message: error.message || 'Failed to delete message' });
      }
    });
    
    // Handle Build-a-Lobby creation via socket
    socket.on('lobby:create', async ({ serverId, name, userLimit, password }) => {
      try {
        const features = lobbyService.getServerFeatures(serverId);
        if (!features.buildALobbyEnabled) {
          socket.emit('error', { message: 'Build-a-Lobby is not enabled' });
          return;
        }

        const categoryId = lobbyService.getVoiceCategoryId(serverId);
        const channel = await lobbyService.createTemporaryLobby(serverId, socket.userId!, {
          name,
          userLimit: userLimit || 0,
          password,
          categoryId,
        });

        io.to(`server:${serverId}`).emit('lobby:created', { channel });
        io.to(`server:${serverId}`).emit('channel:created', { channel });
      } catch (error: any) {
        logger.error('Lobby create error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Handle lobby password verification via socket
    socket.on('lobby:verify-password', async ({ channelId, password }, callback) => {
      try {
        const valid = await lobbyService.verifyLobbyPassword(channelId, password);
        if (callback) callback({ success: valid });
      } catch (error: any) {
        logger.error('Lobby verify password error:', error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      logger.info(`User disconnected: ${socket.username} (${reason})`);
      
      // Leave voice channel with host migration
      if (socket.currentChannel) {
        const channelId = socket.currentChannel;
        const serverId = socket.currentServer;
        const { newHostId } = await voiceService.leaveChannel(socket.userId!);
        
        io.to(`voice:${channelId}`).emit('voice:user-left', {
          userId: socket.userId,
          username: socket.username,
        });
        
        // Notify about host migration if needed
        if (newHostId) {
          io.to(`voice:${channelId}`).emit('voice:host-changed', {
            hostUserId: newHostId,
          });
        }

        // Broadcast to server for Ventrilo-style sidebar + cleanup temp lobbies
        if (serverId) {
          const remainingUsers = await voiceService.getChannelUsers(channelId);
          io.to(`server:${serverId}`).emit('voice:user-left-channel', {
            channelId,
            userId: socket.userId,
            userCount: remainingUsers.length,
          });

          try {
            const channel = await serverService.getChannelById(channelId);
            if (channel && channel.isTemporary && channel.expiresWhenEmpty && remainingUsers.length === 0) {
              const destroyed = await lobbyService.destroyLobby(channelId);
              if (destroyed) {
                io.to(`server:${serverId}`).emit('lobby:destroyed', { channelId, serverId });
                io.to(`server:${serverId}`).emit('channel:deleted', { channelId, serverId });
              }
            }
          } catch (err) {
            logger.error('Lobby cleanup on disconnect error:', err);
          }
        }
      }
      
      // Mark user as offline
      await presence.setOffline(socket.userId!);
      
      // Broadcast offline status
      io.emit('presence:update', {
        userId: socket.userId,
        status: 'offline',
      });
    });
    
    // Handle errors
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
  }, 60000); // Every minute
  
  // Periodic expiry of timed moderation actions (mutes, timeouts)
  setInterval(() => {
    moderationService.expireActions();
  }, 30000); // Every 30 seconds

  // Periodic cleanup of empty temporary lobbies
  setInterval(() => {
    lobbyService.checkAndCleanupEmptyLobbies();
  }, LIMITS.LOBBY_CLEANUP_INTERVAL_MS);
  
  logger.info('Socket.IO initialized');
  
  return io;
}
