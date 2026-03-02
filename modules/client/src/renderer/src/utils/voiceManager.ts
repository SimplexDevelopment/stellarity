/**
 * Voice Manager — SFU Relay Architecture
 *
 * Captures local microphone audio, encodes it to Opus using WebCodecs AudioEncoder,
 * and sends encoded frames to the instance server via Socket.IO for relay to all
 * other voice channel members. Received Opus frames are decoded per-user via
 * AudioDecoder and played through per-user AudioWorklet playback nodes.
 *
 * Audio Pipeline:
 *
 * CAPTURE: Mic → MediaStreamSource → GainNode → AnalyserNode → CaptureWorkletNode
 *                                                                  ↓ (postMessage)
 *                                                              AudioEncoder (Opus)
 *                                                                  ↓ (output)
 *                                                              socket.emit('voice:data')
 *
 * PLAYBACK: socket.on('voice:data') → AudioDecoder[userId] (Opus → PCM)
 *                                         ↓ (output)
 *                                     PlaybackWorkletNode[userId] → GainNode[userId]
 *                                                                     ↓
 *                                                              MasterOutputGain → destination
 */
import { useVoiceStore } from '../stores/voiceStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useServerStore } from '../stores/serverStore';
import { instanceManager } from './instanceManager';
import type { InstanceSocketManager } from './instanceSocket';

// ── AudioWorklet Processor Code (inline for build compatibility) ──────────

/**
 * CaptureProcessor — runs in the AudioWorklet thread.
 * Buffers incoming PCM samples into 20 ms Opus-aligned frames (960 samples at
 * 48 kHz mono) and posts completed frames to the main thread via MessagePort.
 */
const CAPTURE_PROCESSOR_CODE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(960);
    this._writeIndex = 0;
    this._enabled = true;

    this.port.onmessage = (event) => {
      if (event.data.type === 'set-enabled') {
        this._enabled = event.data.value;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0] || !this._enabled) return true;

    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writeIndex++] = channelData[i];

      if (this._writeIndex >= 960) {
        this.port.postMessage(
          { type: 'frame', samples: this._buffer },
          [this._buffer.buffer]
        );
        this._buffer = new Float32Array(960);
        this._writeIndex = 0;
      }
    }

    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
`;

/**
 * PlaybackProcessor — runs in the AudioWorklet thread.
 * Receives decoded PCM samples from the main thread and plays them from a ring
 * buffer with a configurable jitter-smoothing start threshold.
 */
const PLAYBACK_PROCESSOR_CODE = `
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ringBuffer = new Float32Array(19200);
    this._readIndex = 0;
    this._writeIndex = 0;
    this._buffered = 0;
    this._startThreshold = 2880;
    this._started = false;

    this.port.onmessage = (event) => {
      if (event.data.type === 'samples') {
        const samples = event.data.samples;
        const len = this._ringBuffer.length;

        for (let i = 0; i < samples.length; i++) {
          this._ringBuffer[this._writeIndex] = samples[i];
          this._writeIndex = (this._writeIndex + 1) % len;

          if (this._buffered < len) {
            this._buffered++;
          } else {
            this._readIndex = (this._readIndex + 1) % len;
          }
        }

        if (!this._started && this._buffered >= this._startThreshold) {
          this._started = true;
        }
      } else if (event.data.type === 'clear') {
        this._readIndex = 0;
        this._writeIndex = 0;
        this._buffered = 0;
        this._started = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channel = output[0];
    const len = this._ringBuffer.length;

    if (!this._started) {
      for (let i = 0; i < channel.length; i++) channel[i] = 0;
      return true;
    }

    for (let i = 0; i < channel.length; i++) {
      if (this._buffered > 0) {
        channel[i] = this._ringBuffer[this._readIndex];
        this._readIndex = (this._readIndex + 1) % len;
        this._buffered--;
      } else {
        channel[i] = 0;
        this._started = false;
      }
    }

    return true;
  }
}
registerProcessor('playback-processor', PlaybackProcessor);
`;

// ── Helper ────────────────────────────────────────────────────────────────

function getInstanceSocket(): InstanceSocketManager | undefined {
  const { currentInstanceId } = useServerStore.getState();
  if (!currentInstanceId) return undefined;
  return instanceManager.getSocket(currentInstanceId);
}

// ── Remote User Audio State ───────────────────────────────────────────────

interface RemoteUserAudio {
  userId: string;
  decoder: AudioDecoder;
  playbackNode: AudioWorkletNode;
  gainNode: GainNode;
  lastReceivedTime: number;
  speakingTimeout: number | null;
}

// ── Voice Manager ─────────────────────────────────────────────────────────

class VoiceManager {
  // Capture pipeline
  private localStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private captureNode: AudioWorkletNode | null = null;
  private encoder: AudioEncoder | null = null;

  // Playback pipeline
  private masterOutputGain: GainNode | null = null;
  private remoteUsers: Map<string, RemoteUserAudio> = new Map();

  // State
  private speakingCheckInterval: number | null = null;
  private isActive: boolean = false;
  private encoderTimestamp: number = 0;
  private workletModulesLoaded: boolean = false;

  // ── Audio Initialization ────────────────────────────────────────────

  async initializeAudio(): Promise<boolean> {
    try {
      const settings = useSettingsStore.getState();

      // Capture microphone
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: settings.inputDevice ? { exact: settings.inputDevice } : undefined,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      });

      // Create AudioContext at 48 kHz (Opus native rate)
      this.audioContext = new AudioContext({ sampleRate: 48000 });

      // Load AudioWorklet processors (once per AudioContext lifetime)
      if (!this.workletModulesLoaded) {
        const captureBlob = new Blob([CAPTURE_PROCESSOR_CODE], { type: 'application/javascript' });
        const playbackBlob = new Blob([PLAYBACK_PROCESSOR_CODE], { type: 'application/javascript' });
        const captureUrl = URL.createObjectURL(captureBlob);
        const playbackUrl = URL.createObjectURL(playbackBlob);

        await this.audioContext.audioWorklet.addModule(captureUrl);
        await this.audioContext.audioWorklet.addModule(playbackUrl);

        URL.revokeObjectURL(captureUrl);
        URL.revokeObjectURL(playbackUrl);
        this.workletModulesLoaded = true;
      }

      // Build capture audio graph:
      //   Mic → Source → GainNode → AnalyserNode → CaptureWorkletNode
      this.sourceNode = this.audioContext.createMediaStreamSource(this.localStream);

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = settings.inputVolume / 100;

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;

      this.captureNode = new AudioWorkletNode(this.audioContext, 'capture-processor');

      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.captureNode);

      // Master output gain for remote user playback
      this.masterOutputGain = this.audioContext.createGain();
      this.masterOutputGain.gain.value = settings.outputVolume / 100;
      this.masterOutputGain.connect(this.audioContext.destination);

      // Set up Opus encoder
      this.encoderTimestamp = 0;
      this.encoder = new AudioEncoder({
        output: (chunk: EncodedAudioChunk) => {
          if (!this.isActive) return;
          const buffer = new ArrayBuffer(chunk.byteLength);
          chunk.copyTo(buffer);
          this.sendEncodedFrame(buffer);
        },
        error: (e: DOMException) => {
          console.error('AudioEncoder error:', e);
        },
      });

      this.encoder.configure({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 1,
        bitrate: settings.bitrate * 1000,
      });

      // Wire CaptureWorklet → AudioEncoder
      this.captureNode.port.onmessage = (event: MessageEvent) => {
        if (event.data.type !== 'frame' || !this.encoder || this.encoder.state !== 'configured') return;

        const { samples } = event.data as { samples: Float32Array };

        const audioData = new AudioData({
          format: 'f32-planar' as AudioSampleFormat,
          sampleRate: 48000,
          numberOfFrames: samples.length,
          numberOfChannels: 1,
          timestamp: this.encoderTimestamp,
          data: samples.buffer as ArrayBuffer,
        });

        this.encoderTimestamp += (samples.length / 48000) * 1_000_000; // microseconds

        this.encoder.encode(audioData);
        audioData.close();
      };

      // Start voice activity detection
      this.startVoiceActivityDetection();

      // In PTT mode, start with capture disabled
      if (settings.pushToTalk || useVoiceStore.getState().pushToTalk) {
        this.captureNode.port.postMessage({ type: 'set-enabled', value: false });
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      return false;
    }
  }

  // ── Voice Activity Detection ────────────────────────────────────────

  private startVoiceActivityDetection(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const checkSpeaking = () => {
      if (!this.analyser) return;

      const voiceStore = useVoiceStore.getState();
      const settings = useSettingsStore.getState();

      this.analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const threshold = settings.voiceActivityThreshold || voiceStore.voiceActivityThreshold;
      const isSpeaking = average > threshold;

      if (voiceStore.pushToTalk) {
        // PTT mode: speaking indicator reflects actual audio while key is held
        if (this.localStream?.getAudioTracks()[0]?.enabled) {
          if (voiceStore.isSpeaking !== isSpeaking) {
            voiceStore.setIsSpeaking(isSpeaking);
            getInstanceSocket()?.sendSpeakingState(isSpeaking);
          }
        }
        return;
      }

      // VAD mode: enable/disable capture based on speech detection
      if (voiceStore.isSpeaking !== isSpeaking && !voiceStore.selfMute) {
        voiceStore.setIsSpeaking(isSpeaking);
        getInstanceSocket()?.sendSpeakingState(isSpeaking);

        // Enable/disable capture worklet based on VAD
        this.captureNode?.port.postMessage({
          type: 'set-enabled',
          value: isSpeaking && !voiceStore.selfMute,
        });
      }
    };

    this.speakingCheckInterval = window.setInterval(checkSpeaking, 50);
  }

  // ── Push-to-Talk ────────────────────────────────────────────────────

  startPTT(): void {
    const voiceStore = useVoiceStore.getState();
    if (!voiceStore.pushToTalk || voiceStore.selfMute) return;

    this.captureNode?.port.postMessage({ type: 'set-enabled', value: true });
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    }
  }

  stopPTT(): void {
    const voiceStore = useVoiceStore.getState();
    if (!voiceStore.pushToTalk) return;

    this.captureNode?.port.postMessage({ type: 'set-enabled', value: false });
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }

    voiceStore.setIsSpeaking(false);
    getInstanceSocket()?.sendSpeakingState(false);
  }

  // ── Channel Join / Leave ────────────────────────────────────────────

  async joinChannel(channelId: string, serverId: string): Promise<void> {
    // Initialize audio if not already done
    if (!this.localStream) {
      const success = await this.initializeAudio();
      if (!success) {
        throw new Error('Failed to initialize audio');
      }
    }

    // Emit join via socket — the server response ('voice:joined') is handled
    // by instanceManager callbacks which update the Zustand store
    getInstanceSocket()?.joinVoiceChannel(channelId, serverId);

    this.isActive = true;
  }

  async leaveChannel(): Promise<void> {
    this.isActive = false;

    // Notify server
    getInstanceSocket()?.leaveVoiceChannel();

    // Remove all remote users
    for (const [userId] of this.remoteUsers) {
      this.removeRemoteUser(userId);
    }
    this.remoteUsers.clear();

    // Stop capture pipeline
    this.stopCapture();

    // Reset voice store
    useVoiceStore.getState().reset();
  }

  private stopCapture(): void {
    // Stop VAD
    if (this.speakingCheckInterval) {
      clearInterval(this.speakingCheckInterval);
      this.speakingCheckInterval = null;
    }

    // Close encoder
    if (this.encoder && this.encoder.state !== 'closed') {
      this.encoder.close();
      this.encoder = null;
    }

    // Disconnect capture graph
    this.captureNode?.disconnect();
    this.captureNode = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.gainNode?.disconnect();
    this.gainNode = null;
    this.sourceNode?.disconnect();
    this.sourceNode = null;

    // Disconnect master output
    this.masterOutputGain?.disconnect();
    this.masterOutputGain = null;

    // Stop mic stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Close AudioContext
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
      this.workletModulesLoaded = false;
    }

    this.encoderTimestamp = 0;
  }

  // ── Voice Data Handling (SFU Relay) ─────────────────────────────────

  /** Send an encoded Opus frame to the instance server for relay */
  private sendEncodedFrame(data: ArrayBuffer): void {
    getInstanceSocket()?.sendVoiceData(data);
  }

  /** Handle an incoming relayed voice data frame from another user */
  handleVoiceData(fromUserId: string, data: ArrayBuffer): void {
    if (!this.isActive || !this.audioContext) return;

    // Ignore own voice data (server uses socket.to() which excludes sender,
    // but guard defensively)
    const ownId = useVoiceStore.getState().hostUserId; // not ideal, but safe
    if (fromUserId === ownId) return;

    const remote = this.getOrCreateRemoteUser(fromUserId);

    // Mark user as speaking
    remote.lastReceivedTime = Date.now();
    if (remote.speakingTimeout) {
      clearTimeout(remote.speakingTimeout);
    }

    useVoiceStore.getState().updateUserVoiceState(fromUserId, { speaking: true });

    // Clear speaking state after 300 ms of silence
    remote.speakingTimeout = window.setTimeout(() => {
      useVoiceStore.getState().updateUserVoiceState(fromUserId, { speaking: false });
      remote.speakingTimeout = null;
    }, 300);

    // Decode the Opus frame
    try {
      const chunk = new EncodedAudioChunk({
        type: 'key', // All Opus frames are independently decodable
        timestamp: 0,
        data,
      });

      remote.decoder.decode(chunk);
    } catch (e) {
      console.error(`Failed to decode voice data from ${fromUserId}:`, e);
    }
  }

  /** Handle a user leaving the voice channel */
  handleUserLeft(userId: string): void {
    this.removeRemoteUser(userId);
  }

  // ── Remote User Management ──────────────────────────────────────────

  private getOrCreateRemoteUser(userId: string): RemoteUserAudio {
    const existing = this.remoteUsers.get(userId);
    if (existing) return existing;

    if (!this.audioContext || !this.masterOutputGain) {
      throw new Error('AudioContext not initialized');
    }

    // Create per-user playback: AudioWorkletNode → GainNode → Master Output
    const playbackNode = new AudioWorkletNode(this.audioContext, 'playback-processor');
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 1.0;

    playbackNode.connect(gainNode);
    gainNode.connect(this.masterOutputGain);

    // Create per-user AudioDecoder
    const decoder = new AudioDecoder({
      output: (audioData: AudioData) => {
        try {
          const samples = new Float32Array(audioData.numberOfFrames * audioData.numberOfChannels);
          audioData.copyTo(samples, { planeIndex: 0 });
          playbackNode.port.postMessage({ type: 'samples', samples });
        } finally {
          audioData.close();
        }
      },
      error: (e: DOMException) => {
        console.error(`AudioDecoder error for user ${userId}:`, e);
      },
    });

    decoder.configure({
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 1,
    });

    const remote: RemoteUserAudio = {
      userId,
      decoder,
      playbackNode,
      gainNode,
      lastReceivedTime: Date.now(),
      speakingTimeout: null,
    };

    this.remoteUsers.set(userId, remote);
    return remote;
  }

  private removeRemoteUser(userId: string): void {
    const remote = this.remoteUsers.get(userId);
    if (!remote) return;

    if (remote.speakingTimeout) {
      clearTimeout(remote.speakingTimeout);
    }

    if (remote.decoder.state !== 'closed') {
      remote.decoder.close();
    }

    remote.playbackNode.disconnect();
    remote.gainNode.disconnect();

    this.remoteUsers.delete(userId);
  }

  // ── Controls ────────────────────────────────────────────────────────

  setMute(muted: boolean): void {
    this.captureNode?.port.postMessage({ type: 'set-enabled', value: !muted });
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

    useVoiceStore.getState().setSelfMute(muted);
    getInstanceSocket()?.updateVoiceState(muted, useVoiceStore.getState().selfDeaf);

    if (muted) {
      useVoiceStore.getState().setIsSpeaking(false);
      getInstanceSocket()?.sendSpeakingState(false);
    }
  }

  setDeafen(deaf: boolean): void {
    // Mute all remote audio by zeroing master output gain
    if (this.masterOutputGain) {
      this.masterOutputGain.gain.value = deaf
        ? 0
        : useSettingsStore.getState().outputVolume / 100;
    }

    // Deafening also mutes
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
    if (this.masterOutputGain) {
      this.masterOutputGain.gain.value = volume / 100;
    }
  }

  async setBitrate(bitrate: number): Promise<void> {
    if (this.encoder && this.encoder.state === 'configured') {
      this.encoder.configure({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 1,
        bitrate: bitrate * 1000,
      });
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
    if (!this.audioContext || !this.gainNode) return;

    // Stop old tracks
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => track.stop());
    }

    // Get new stream with selected device
    const settings = useSettingsStore.getState();
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
        sampleRate: 48000,
        channelCount: 1,
      },
    });

    // Reconnect source node
    this.sourceNode?.disconnect();
    this.sourceNode = this.audioContext.createMediaStreamSource(this.localStream);
    this.sourceNode.connect(this.gainNode);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (this.audioContext && 'setSinkId' in this.audioContext) {
      await (this.audioContext as any).setSinkId(deviceId);
    }
  }

  // Alias methods for component compatibility
  setMuted(muted: boolean): void {
    this.setMute(muted);
  }

  setDeafened(deaf: boolean): void {
    this.setDeafen(deaf);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  cleanup(): void {
    this.isActive = false;

    // Remove all remote users
    for (const [userId] of this.remoteUsers) {
      this.removeRemoteUser(userId);
    }
    this.remoteUsers.clear();

    // Stop capture pipeline
    this.stopCapture();
  }
}

export const voiceManager = new VoiceManager();
