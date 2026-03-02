import type { Server as SocketServer } from 'socket.io';
import type { AuthenticatedSocket } from './types.js';
import { serverService } from '../services/server.service.js';
import { messageService } from '../services/message.service.js';
import { moderationService } from '../services/moderation.service.js';
import { logger } from '../utils/logger.js';

export function registerMessageHandlers(io: SocketServer, socket: AuthenticatedSocket): void {
  // Handle typing indicator
  socket.on('typing:start', ({ channelId }: { channelId: string }) => {
    socket.to(`server:${socket.currentServer}`).emit('typing:start', {
      channelId,
      userId: socket.userId,
      username: socket.username,
    });
  });

  socket.on('typing:stop', ({ channelId }: { channelId: string }) => {
    socket.to(`server:${socket.currentServer}`).emit('typing:stop', {
      channelId,
      userId: socket.userId,
    });
  });

  // Handle real-time messaging via socket
  socket.on('message:send', async ({ channelId, content, encrypted, replyToId }: { channelId: string; content: string; encrypted?: boolean; replyToId?: string }) => {
    try {
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

      if (moderationService.isUserMuted(channel.serverId, socket.userId!)) {
        socket.emit('error', { message: 'You are muted in this server' });
        return;
      }

      const message = await messageService.createMessage({
        channelId,
        userId: socket.userId!,
        content,
        encrypted: encrypted || false,
        replyToId,
      });

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
  socket.on('message:edit', async ({ messageId, content }: { messageId: string; content: string }) => {
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
  socket.on('message:delete', async ({ messageId, channelId }: { messageId: string; channelId: string }) => {
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
}
