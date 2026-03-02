import { useVoiceStore } from '../stores/voiceStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useServerStore } from '../stores/serverStore';
import { instanceManager } from './instanceManager';
import type { InstanceSocketManager } from './instanceSocket';

/** Get the socket for the currently active instance */
function getInstanceSocket(): InstanceSocketManager | undefined {
  const { currentInstanceId } = useServerStore.getState();
  if (!currentInstanceId) return undefined;
  return instanceManager.getSocket(currentInstanceId);
}

interface PeerConnection {
  pc: RTCPeerConnection;
  userId: string;
  audioElement?: HTMLAudioElement;
  latency: number;
  packetsLost: number;
  lastStatsTime: number;
}

class VoiceManager {
  private localStream: MediaStream | null = null;
  private peers: Map<string, PeerConnection> = new Map();
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private speakingCheckInterval: number | null = null;
  private qualityCheckInterval: number | null = null;
  private channelKey: string | null = null;
  
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  
  async initializeAudio(): Promise<boolean> {
    try {
      const settings = useSettingsStore.getState();
      
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: settings.inputDevice ? { exact: settings.inputDevice } : undefined,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      };
      
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Set up audio processing
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      
      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = settings.inputVolume / 100;
      
      // Create analyser for voice activity detection
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      source.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      
      // Start voice activity detection
      this.startVoiceActivityDetection();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      return false;
    }
  }
  
  private startVoiceActivityDetection() {
    if (!this.analyser) return;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    const checkSpeaking = () => {
      if (!this.analyser) return;
      
      const voiceStore = useVoiceStore.getState();
      const settings = useSettingsStore.getState();
      
      // In PTT mode, speaking indicator is handled by startPTT/stopPTT
      // But we still check if mic is picking up audio while transmitting
      if (voiceStore.pushToTalk) {
        // In PTT mode, only show speaking indicator when key is held AND audio is detected
        if (this.localStream?.getAudioTracks()[0]?.enabled) {
          this.analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          const threshold = settings.voiceActivityThreshold || voiceStore.voiceActivityThreshold;
          const isActuallySpeaking = average > threshold;
          
          if (voiceStore.isSpeaking !== isActuallySpeaking) {
            voiceStore.setIsSpeaking(isActuallySpeaking);
            getInstanceSocket()?.sendSpeakingState(isActuallySpeaking);
          }
        }
        return;
      }
      
      // VAD mode - enable/disable track based on voice detection
      this.analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const threshold = settings.voiceActivityThreshold || voiceStore.voiceActivityThreshold;
      const isSpeaking = average > threshold;
      
      if (voiceStore.isSpeaking !== isSpeaking && !voiceStore.selfMute) {
        voiceStore.setIsSpeaking(isSpeaking);
        getInstanceSocket()?.sendSpeakingState(isSpeaking);
        
        // In VAD mode, mute/unmute the track based on speaking
        if (this.localStream) {
          this.localStream.getAudioTracks().forEach((track) => {
            track.enabled = isSpeaking && !voiceStore.selfMute;
          });
        }
      }
    };
    
    this.speakingCheckInterval = window.setInterval(checkSpeaking, 50);
  }
  
  // PTT key handlers
  startPTT(): void {
    const voiceStore = useVoiceStore.getState();
    if (!voiceStore.pushToTalk || voiceStore.selfMute) return;
    
    // Enable the audio track - speaking indicator will be updated by VAD check
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    }
  }
  
  stopPTT(): void {
    const voiceStore = useVoiceStore.getState();
    if (!voiceStore.pushToTalk) return;
    
    // Disable the audio track and clear speaking state
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
    
    // Clear speaking state when PTT released
    voiceStore.setIsSpeaking(false);
    getInstanceSocket()?.sendSpeakingState(false);
    
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
  }
  
  async joinChannel(channelId: string, serverId: string, channelKey?: string): Promise<void> {
    this.channelKey = channelKey || null;
    
    // Initialize audio if not already done
    if (!this.localStream) {
      const success = await this.initializeAudio();
      if (!success) {
        throw new Error('Failed to initialize audio');
      }
    }
    
    // Connect via socket
    const instanceSocket = getInstanceSocket();
    instanceSocket?.joinVoiceChannel(channelId, serverId);
    
    // Set up signaling handlers
    const socket = instanceSocket?.getSocket() ?? null;
    if (socket) {
      socket.on('voice:signal', this.handleSignal.bind(this));
      socket.on('voice:user-joined', this.handleUserJoined.bind(this));
      socket.on('voice:user-left', this.handleUserLeft.bind(this));
      socket.on('voice:host-changed', this.handleHostChanged.bind(this));
    }
    
    // Start quality monitoring
    this.startQualityMonitoring();
  }
  
  async leaveChannel(): Promise<void> {
    // Close all peer connections
    for (const [userId, peer] of this.peers) {
      peer.pc.close();
      if (peer.audioElement) {
        peer.audioElement.pause();
        peer.audioElement.srcObject = null;
      }
    }
    this.peers.clear();
    
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    
    // Stop voice activity detection
    if (this.speakingCheckInterval) {
      clearInterval(this.speakingCheckInterval);
      this.speakingCheckInterval = null;
    }
    
    // Stop quality monitoring
    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval);
      this.qualityCheckInterval = null;
    }
    
    // Close audio context
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    
    // Remove socket listeners
    const instanceSocket = getInstanceSocket();
    const socket = instanceSocket?.getSocket() ?? null;
    if (socket) {
      socket.off('voice:signal');
      socket.off('voice:user-joined');
      socket.off('voice:user-left');
      socket.off('voice:host-changed');
    }
    
    // Notify server
    instanceSocket?.leaveVoiceChannel();
    this.channelKey = null;
  }
  
  private async handleUserJoined({ userId, username }: { userId: string; username: string }) {
    // Create peer connection for new user and send offer
    await this.createPeerConnection(userId, true);
  }
  
  private handleUserLeft({ userId }: { userId: string }) {
    const peer = this.peers.get(userId);
    if (peer) {
      peer.pc.close();
      if (peer.audioElement) {
        peer.audioElement.pause();
        peer.audioElement.srcObject = null;
      }
      this.peers.delete(userId);
    }
  }
  
  private handleHostChanged({ hostUserId }: { hostUserId: string }) {
    console.log('Voice host changed to:', hostUserId);
    // Potentially reconnect peers through new host if using mesh-through-host topology
    // For pure P2P mesh, this is just informational
  }
  
  // Quality monitoring for host migration decisions
  private startQualityMonitoring() {
    this.qualityCheckInterval = window.setInterval(async () => {
      const qualities: number[] = [];
      
      for (const [userId, peer] of this.peers) {
        try {
          const stats = await peer.pc.getStats();
          let totalLatency = 0;
          let totalPacketsLost = 0;
          let packetsReceived = 0;
          
          stats.forEach((report) => {
            if (report.type === 'inbound-rtp' && report.kind === 'audio') {
              totalPacketsLost += report.packetsLost || 0;
              packetsReceived += report.packetsReceived || 0;
            }
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              totalLatency = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
            }
          });
          
          // Calculate quality score (0-100)
          const packetLossRatio = packetsReceived > 0 ? totalPacketsLost / (totalPacketsLost + packetsReceived) : 0;
          const latencyScore = Math.max(0, 100 - totalLatency); // Lower latency = higher score
          const packetScore = Math.max(0, 100 - packetLossRatio * 100);
          const quality = Math.round((latencyScore + packetScore) / 2);
          
          peer.latency = totalLatency;
          peer.packetsLost = totalPacketsLost;
          peer.lastStatsTime = Date.now();
          
          qualities.push(quality);
        } catch (e) {
          // Stats not available
        }
      }
      
      // Report average quality to server
      if (qualities.length > 0) {
        const avgQuality = Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length);
        getInstanceSocket()?.sendConnectionQuality(avgQuality);
      }
    }, 5000); // Check every 5 seconds
  }
  
  private async handleSignal({ fromUserId, signal }: { fromUserId: string; signal: any }) {
    let peer = this.peers.get(fromUserId);
    const settings = useSettingsStore.getState();
    
    if (signal.type === 'offer') {
      // Received offer, create connection and send answer
      if (!peer) {
        await this.createPeerConnection(fromUserId, false);
        peer = this.peers.get(fromUserId);
      }
      
      if (peer) {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await peer.pc.createAnswer();
        
        // Optimize Opus in answer SDP too
        let sdp = answer.sdp || '';
        sdp = this.optimizeOpusSdp(sdp, settings.bitrate);
        answer.sdp = sdp;
        
        await peer.pc.setLocalDescription(answer);
        getInstanceSocket()?.sendVoiceSignal(fromUserId, answer);
      }
    } else if (signal.type === 'answer') {
      // Received answer to our offer
      if (peer) {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(signal));
      }
    } else if (signal.candidate) {
      // ICE candidate
      if (peer) {
        await peer.pc.addIceCandidate(new RTCIceCandidate(signal));
      }
    }
  }
  
  private async createPeerConnection(userId: string, initiator: boolean): Promise<void> {
    const settings = useSettingsStore.getState();
    
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10,
    });
    
    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getInstanceSocket()?.sendVoiceSignal(userId, event.candidate);
      }
    };
    
    // Handle remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      this.playRemoteAudio(userId, remoteStream);
    };
    
    // Handle connection state
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${userId}:`, pc.connectionState);
      if (pc.connectionState === 'failed') {
        // Try to reconnect
        this.handleUserLeft({ userId });
      }
    };
    
    this.peers.set(userId, { pc, userId, latency: 0, packetsLost: 0, lastStatsTime: Date.now() });
    
    // If initiator, create and send offer with optimal Opus settings
    if (initiator) {
      const offer = await pc.createOffer();
      
      // Modify SDP to optimize Opus codec for voice
      let sdp = offer.sdp || '';
      sdp = this.optimizeOpusSdp(sdp, settings.bitrate);
      offer.sdp = sdp;
      
      await pc.setLocalDescription(offer);
      getInstanceSocket()?.sendVoiceSignal(userId, offer);
    }
  }
  
  // Optimize Opus codec settings in SDP for maximum efficiency
  private optimizeOpusSdp(sdp: string, bitrate: number): string {
    // Find Opus payload type
    const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/);
    if (!opusMatch) return sdp;
    
    const opusPayload = opusMatch[1];
    
    // Remove existing fmtp line for opus if present
    sdp = sdp.replace(new RegExp(`a=fmtp:${opusPayload}[^\r\n]*\r\n`, 'g'), '');
    
    // Add optimized fmtp line for voice:
    // - maxaveragebitrate: target bitrate in bits/sec
    // - useinbandfec=1: enable forward error correction
    // - usedtx=1: enable discontinuous transmission (saves bandwidth when silent)
    // - stereo=0: mono for voice (more efficient)
    // - cbr=0: variable bitrate (more efficient for voice)
    // - maxplaybackrate=24000: optimize for voice frequencies
    const fmtpLine = `a=fmtp:${opusPayload} minptime=10;useinbandfec=1;usedtx=1;stereo=0;cbr=0;maxaveragebitrate=${bitrate * 1000};maxplaybackrate=24000\r\n`;
    
    // Insert after rtpmap line
    sdp = sdp.replace(
      new RegExp(`(a=rtpmap:${opusPayload} opus/48000/2\r\n)`),
      `$1${fmtpLine}`
    );
    
    return sdp;
  }
  
  private playRemoteAudio(userId: string, stream: MediaStream): void {
    const peer = this.peers.get(userId);
    if (!peer) return;
    
    const settings = useSettingsStore.getState();
    
    // Create audio element for playback
    const audio = new Audio();
    audio.srcObject = stream;
    audio.volume = settings.outputVolume / 100;
    audio.autoplay = true;
    
    // Set output device if specified
    if (settings.outputDevice && 'setSinkId' in audio) {
      (audio as any).setSinkId(settings.outputDevice).catch(console.error);
    }
    
    peer.audioElement = audio;
  }
  
  setMute(muted: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    useVoiceStore.getState().setSelfMute(muted);
    getInstanceSocket()?.updateVoiceState(muted, useVoiceStore.getState().selfDeaf);
  }
  
  setDeafen(deaf: boolean): void {
    // Mute all remote audio
    for (const [, peer] of this.peers) {
      if (peer.audioElement) {
        peer.audioElement.muted = deaf;
      }
    }
    
    // If deafening, also mute
    if (deaf) {
      this.setMute(true);
    }
    
    useVoiceStore.getState().setSelfDeaf(deaf);
    getInstanceSocket()?.updateVoiceState(useVoiceStore.getState().selfMute, deaf);
  }
  
  setInputVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = volume / 100;
    }
  }
  
  setOutputVolume(volume: number): void {
    for (const [, peer] of this.peers) {
      if (peer.audioElement) {
        peer.audioElement.volume = volume / 100;
      }
    }
  }
  
  async setBitrate(bitrate: number): Promise<void> {
    for (const [, peer] of this.peers) {
      const senders = peer.pc.getSenders();
      for (const sender of senders) {
        if (sender.track?.kind === 'audio') {
          const params = sender.getParameters();
          if (!params.encodings) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = bitrate * 1000;
          await sender.setParameters(params);
        }
      }
    }
  }
  
  async getAudioDevices(): Promise<{ input: MediaDeviceInfo[]; output: MediaDeviceInfo[] }> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      input: devices.filter((d) => d.kind === 'audioinput'),
      output: devices.filter((d) => d.kind === 'audiooutput'),
    };
  }
  
  async setInputDevice(deviceId: string): Promise<void> {
    if (!this.localStream) return;
    
    // Stop old tracks
    this.localStream.getAudioTracks().forEach((track) => track.stop());
    
    // Get new stream with selected device
    const settings = useSettingsStore.getState();
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
      },
    });
    
    this.localStream = newStream;
    
    // Replace tracks in all peer connections
    const [newTrack] = newStream.getAudioTracks();
    for (const [, peer] of this.peers) {
      const sender = peer.pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender) {
        await sender.replaceTrack(newTrack);
      }
    }
  }
  
  async setOutputDevice(deviceId: string): Promise<void> {
    for (const [, peer] of this.peers) {
      if (peer.audioElement && 'setSinkId' in peer.audioElement) {
        await (peer.audioElement as any).setSinkId(deviceId);
      }
    }
  }
  
  // Alias methods for compatibility
  setMuted(muted: boolean): void {
    this.setMute(muted);
  }
  
  setDeafened(deaf: boolean): void {
    this.setDeafen(deaf);
  }
  
  // Cleanup all connections and resources
  cleanup(): void {
    // Stop voice activity detection
    if (this.speakingCheckInterval) {
      clearInterval(this.speakingCheckInterval);
      this.speakingCheckInterval = null;
    }
    
    // Close all peer connections
    for (const [userId] of this.peers) {
      this.removePeer(userId);
    }
    this.peers.clear();
    
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    
    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
    this.gainNode = null;
    this.channelKey = null;
  }
  
  private removePeer(userId: string): void {
    const peer = this.peers.get(userId);
    if (peer) {
      peer.pc.close();
      if (peer.audioElement) {
        peer.audioElement.pause();
        peer.audioElement.srcObject = null;
      }
      this.peers.delete(userId);
    }
  }
}

export const voiceManager = new VoiceManager();
