/**
 * Central Socket Manager
 * 
 * Manages the persistent WebSocket connection to the central server.
 * Handles:
 * - Global user presence (online/offline/idle/dnd)
 * - DM signaling (WebRTC data channel negotiation for P2P DMs)
 * - Pending DM delivery notifications
 */
import { io, Socket } from 'socket.io-client';

const CENTRAL_URL = import.meta.env.VITE_CENTRAL_URL || 'http://localhost:3001';

export type DMSignalHandler = (data: { peerId: string; signal: any }) => void;
export type DMPendingHandler = (data: { messages: any[]; count: number }) => void;
export type PresenceHandler = (data: { userId: string; status: string }) => void;

class CentralSocketManager {
  private socket: Socket | null = null;
  private dmSignalHandler: DMSignalHandler | null = null;
  private dmPendingHandler: DMPendingHandler | null = null;
  private presenceHandler: PresenceHandler | null = null;

  connect(token: string): void {
    if (this.socket?.connected) return;

    this.socket = io(CENTRAL_URL, {
      auth: { token },
      path: '/central-ws',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    this.setupListeners();
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[CentralSocket] Connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[CentralSocket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[CentralSocket] Connection error:', error.message);
    });

    // ── Presence ──────────────────────────────────────────────────

    this.socket.on('user:status', (data: { userId: string; status: string }) => {
      this.presenceHandler?.(data);
    });

    // ── DM Signaling ──────────────────────────────────────────────

    this.socket.on('dm:signal', (data: { peerId: string; signal: any }) => {
      this.dmSignalHandler?.(data);
    });

    this.socket.on('dm:peer-offline', (data: { peerId: string }) => {
      console.log(`[CentralSocket] Peer ${data.peerId} is offline, use buffer`);
    });

    this.socket.on('dm:pending', (data: { messages: any[]; count: number }) => {
      console.log(`[CentralSocket] ${data.count} pending DMs`);
      this.dmPendingHandler?.(data);
    });

    this.socket.on('dm:new-buffered', (data: { senderId: string; messageId: string }) => {
      console.log(`[CentralSocket] New buffered DM from ${data.senderId}`);
      // Trigger a fetch of pending messages
      this.dmPendingHandler?.({ messages: [], count: 1 });
    });
  }

  // ── DM Signaling API ──────────────────────────────────────────────

  sendDMSignal(peerId: string, signal: any): void {
    this.socket?.emit('dm:signal', { peerId, signal });
  }

  checkUserOnline(userId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve(false);
        return;
      }
      this.socket.emit('dm:check-online', { userId }, (result: { online: boolean }) => {
        resolve(result.online);
      });
    });
  }

  notifyBufferedDM(recipientId: string, messageId: string): void {
    this.socket?.emit('dm:buffered', { recipientId, messageId });
  }

  // ── Presence API ──────────────────────────────────────────────────

  updatePresence(status: 'online' | 'idle' | 'dnd'): void {
    this.socket?.emit('presence:update', { status });
  }

  // ── Event Handlers ────────────────────────────────────────────────

  onDMSignal(handler: DMSignalHandler): void {
    this.dmSignalHandler = handler;
  }

  onDMPending(handler: DMPendingHandler): void {
    this.dmPendingHandler = handler;
  }

  onPresence(handler: PresenceHandler): void {
    this.presenceHandler = handler;
  }

  // ── Utility ───────────────────────────────────────────────────────

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const centralSocket = new CentralSocketManager();
