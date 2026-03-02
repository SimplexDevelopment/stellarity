// ============================================================
// Voice Types — WebRTC voice communication
// ============================================================

export interface VoiceState {
  userId: string;
  channelId: string | null;
  serverId: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
}

export interface VoiceChannelState {
  channelId: string;
  serverId: string;
  users: VoiceUser[];
  hostUserId: string | null;
}

export interface VoiceUser {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  speaking: boolean;
  connectionQuality: number; // 0-100
}

export interface VoiceJoinedPayload {
  channelId: string;
  serverId: string;
  users: VoiceUser[];
  channelKey: string;
  hostUserId: string;
  isHost: boolean;
}

export interface VoiceSignal {
  targetUserId?: string;
  fromUserId?: string;
  signal: RTCSignalData;
}

/** Simplified RTC signal for serialization */
export type RTCSignalData = {
  type: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

export interface VoiceQualityReport {
  userId: string;
  quality: number; // 0-100
  latency: number;
  packetLoss: number;
  jitter: number;
}
