import type { Server as SocketServer } from 'socket.io';
import type { AuthenticatedSocket } from './types.js';
import { voiceService } from '../services/voice.service.js';
import { serverService } from '../services/server.service.js';
import { lobbyService } from '../services/lobby.service.js';
import { logger } from '../utils/logger.js';

/**
 * Helper: leave a voice channel and emit all related events.
 * Used by both `voice:leave` and `disconnect` handlers to avoid duplication.
 */
export async function handleVoiceLeave(io: SocketServer, socket: AuthenticatedSocket): Promise<void> {
  if (!socket.currentChannel) return;

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
      logger.error('Lobby cleanup on voice leave error:', err);
    }
  }
}

export function registerVoiceHandlers(io: SocketServer, socket: AuthenticatedSocket): void {
  // Handle joining a voice channel
  socket.on('voice:join', async ({ channelId, serverId }: { channelId: string; serverId: string }) => {
    try {
      const isMember = await serverService.isServerMember(serverId, socket.userId!);
      if (!isMember) {
        socket.emit('error', { message: 'Not a member of this server' });
        return;
      }

      // Leave current channel if in one
      if (socket.currentChannel) {
        await handleVoiceLeave(io, socket);
      }

      let actualChannelId = channelId;

      try {
        const { users, channelKey, hostUserId, isHost } = await voiceService.joinChannel(
          socket.userId!,
          actualChannelId,
          serverId
        );

        socket.currentChannel = actualChannelId;
        socket.join(`voice:${actualChannelId}`);

        socket.to(`voice:${actualChannelId}`).emit('voice:user-joined', {
          userId: socket.userId,
          username: socket.username,
        });

        socket.emit('voice:joined', {
          channelId: actualChannelId,
          users,
          channelKey,
          hostUserId,
          isHost,
        });

        io.to(`server:${serverId}`).emit('voice:state-update', {
          userId: socket.userId,
          channelId: actualChannelId,
        });

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
    try {
      await handleVoiceLeave(io, socket);
      socket.emit('voice:left');
    } catch (error) {
      logger.error('Voice leave error:', error);
    }
  });

  // Handle voice state updates (mute/deaf)
  socket.on('voice:state', async ({ selfMute, selfDeaf }: { selfMute: boolean; selfDeaf: boolean }) => {
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
  socket.on('voice:signal', ({ targetUserId, signal }: { targetUserId: string; signal: unknown }) => {
    io.to(`user:${targetUserId}`).emit('voice:signal', {
      fromUserId: socket.userId,
      signal,
    });
  });

  // Handle encrypted voice data relay
  socket.on('voice:data', (encryptedData: Buffer) => {
    if (socket.currentChannel) {
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
  socket.on('voice:quality', async ({ quality }: { quality: number }) => {
    if (socket.currentChannel) {
      await voiceService.updateConnectionQuality(socket.currentChannel, socket.userId!, quality);

      io.to(`voice:${socket.currentChannel}`).emit('voice:quality-update', {
        userId: socket.userId,
        quality,
      });
    }
  });

  // Handle request for host migration
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
}
