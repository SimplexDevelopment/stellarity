import type { Server as SocketServer } from 'socket.io';
import type { AuthenticatedSocket } from './types.js';
import { serverService } from '../services/server.service.js';
import { reactionService } from '../services/reaction.service.js';
import { threadService } from '../services/thread.service.js';
import { encryptionService } from '../services/encryption.service.js';
import { lobbyService } from '../services/lobby.service.js';
import { logger } from '../utils/logger.js';

export function registerReactionHandlers(io: SocketServer, socket: AuthenticatedSocket): void {
  socket.on('reaction:add', async ({ messageId, channelId, emoji }: { messageId: string; channelId: string; emoji: string }) => {
    try {
      const channel = await serverService.getChannel(channelId);
      if (!channel) {
        socket.emit('error', { message: 'Channel not found' });
        return;
      }

      const added = reactionService.addReaction(messageId, channelId, socket.userId!, emoji);
      if (added) {
        io.to(`server:${channel.serverId}`).emit('reaction:added', {
          messageId,
          channelId,
          emoji,
          userId: socket.userId,
        });
      }
    } catch (error: any) {
      logger.error('Reaction add error:', error);
      socket.emit('error', { message: error.message || 'Failed to add reaction' });
    }
  });

  socket.on('reaction:remove', async ({ messageId, channelId, emoji }: { messageId: string; channelId: string; emoji: string }) => {
    try {
      const channel = await serverService.getChannel(channelId);
      if (!channel) {
        socket.emit('error', { message: 'Channel not found' });
        return;
      }

      const removed = reactionService.removeReaction(messageId, socket.userId!, emoji);
      if (removed) {
        io.to(`server:${channel.serverId}`).emit('reaction:removed', {
          messageId,
          channelId,
          emoji,
          userId: socket.userId,
        });
      }
    } catch (error: any) {
      logger.error('Reaction remove error:', error);
      socket.emit('error', { message: error.message || 'Failed to remove reaction' });
    }
  });
}

export function registerThreadHandlers(io: SocketServer, socket: AuthenticatedSocket): void {
  socket.on('thread:join', ({ threadId }: { threadId: string }) => {
    socket.join(`thread:${threadId}`);
  });

  socket.on('thread:leave', ({ threadId }: { threadId: string }) => {
    socket.leave(`thread:${threadId}`);
  });

  socket.on('thread:message-send', async ({ threadId, content, encrypted, replyToId }: { threadId: string; content: string; encrypted?: boolean; replyToId?: string }) => {
    try {
      const thread = threadService.getThread(threadId);
      if (!thread) {
        socket.emit('error', { message: 'Thread not found' });
        return;
      }
      if (thread.isLocked || thread.isArchived) {
        socket.emit('error', { message: 'Thread is locked or archived' });
        return;
      }

      const isMember = await serverService.isServerMember(thread.serverId, socket.userId!);
      if (!isMember) {
        socket.emit('error', { message: 'You do not have access to this thread' });
        return;
      }

      const message = threadService.createThreadMessage(threadId, socket.userId!, content, encrypted || false, replyToId);

      const messageWithAuthor = {
        ...message,
        author: { id: socket.userId, username: socket.username },
      };

      io.to(`thread:${threadId}`).emit('thread:message-new', {
        threadId,
        channelId: thread.channelId,
        message: messageWithAuthor,
      });
    } catch (error: any) {
      logger.error('Thread message send error:', error);
      socket.emit('error', { message: error.message || 'Failed to send thread message' });
    }
  });
}

export function registerEncryptionHandlers(io: SocketServer, socket: AuthenticatedSocket): void {
  socket.on('channel:register-key', async ({ channelId, publicKey }: { channelId: string; publicKey: string }) => {
    try {
      encryptionService.registerKey(channelId, socket.userId!, publicKey);

      const channel = await serverService.getChannel(channelId);
      if (channel) {
        io.to(`server:${channel.serverId}`).emit('channel:key-exchange', {
          channelId,
          userId: socket.userId,
          publicKey,
        });
      }
    } catch (error: any) {
      logger.error('Key registration error:', error);
      socket.emit('error', { message: error.message || 'Failed to register key' });
    }
  });

  socket.on('channel:key-exchange', async ({ channelId, targetUserId, encryptedKey }: { channelId: string; targetUserId: string; encryptedKey: string }) => {
    try {
      io.to(`user:${targetUserId}`).emit('channel:key-exchange', {
        channelId,
        userId: socket.userId,
        encryptedKey,
      });
    } catch (error: any) {
      logger.error('Key exchange error:', error);
      socket.emit('error', { message: error.message || 'Failed to exchange key' });
    }
  });
}

export function registerLobbyHandlers(io: SocketServer, socket: AuthenticatedSocket): void {
  socket.on('lobby:create', async ({ serverId, name, userLimit, password }: { serverId: string; name: string; userLimit?: number; password?: string }) => {
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

  socket.on('lobby:verify-password', async ({ channelId, password }: { channelId: string; password: string }, callback: (result: { success: boolean; error?: string }) => void) => {
    try {
      const valid = await lobbyService.verifyLobbyPassword(channelId, password);
      if (callback) callback({ success: valid });
    } catch (error: any) {
      logger.error('Lobby verify password error:', error);
      if (callback) callback({ success: false, error: error.message });
    }
  });
}
