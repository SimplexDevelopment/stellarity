/**
 * Socket Emitter
 * 
 * Provides a way for routes/services to emit socket events
 * without direct access to the Socket.IO server instance.
 */

import { Server as SocketServer } from 'socket.io';

let io: SocketServer | null = null;

export function setSocketServer(server: SocketServer) {
  io = server;
}

export function getSocketServer(): SocketServer {
  if (!io) {
    throw new Error('Socket server not initialized');
  }
  return io;
}

/** Emit an event to all members in a server room */
export function emitToServer(serverId: string, event: string, data: any) {
  if (io) {
    io.to(`server:${serverId}`).emit(event, data);
  }
}

/** Emit an event to a specific user */
export function emitToUser(userId: string, event: string, data: any) {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}
