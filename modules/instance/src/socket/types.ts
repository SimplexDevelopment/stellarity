import type { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  displayName?: string | null;
  currentChannel?: string;
  currentServer?: string;
}
