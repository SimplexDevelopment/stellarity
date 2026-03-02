import React, { useEffect, useState } from 'react'
import { useVoiceStore } from '../../stores/voiceStore'
import { useServerStore } from '../../stores/serverStore'
import { useAuthStore } from '../../stores/authStore'
import { SignalIcon, WifiIcon, WifiOffIcon, UsersIcon } from '../Icons'
import './TelemetryBar.css'

export const TelemetryBar: React.FC = () => {
  const { isConnected: voiceConnected } = useVoiceStore()
  const { members, onlineUsers, currentServerId, channels, currentChannelId } = useServerStore()
  const { user } = useAuthStore()

  const [latency, setLatency] = useState(42)
  const [uptime, setUptime] = useState('00:00:00')
  const [startTime] = useState(Date.now())

  // Simulated latency jitter — replace with real ping later
  useEffect(() => {
    const id = setInterval(() => {
      setLatency(Math.floor(30 + Math.random() * 60))
    }, 5000)
    return () => clearInterval(id)
  }, [])

  // Uptime counter
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      const h = String(Math.floor(elapsed / 3600)).padStart(2, '0')
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')
      const s = String(elapsed % 60).padStart(2, '0')
      setUptime(`${h}:${m}:${s}`)
    }, 1000)
    return () => clearInterval(id)
  }, [startTime])

  const currentChannel = channels.find((c) => c.id === currentChannelId)
  const onlineCount = onlineUsers.size

  const latencyClass = latency < 80 ? 'good' : latency < 150 ? 'warn' : 'bad'

  return (
    <div className="telemetry-bar">
      {/* Connection status */}
      <div className="telemetry-cell" data-tooltip="Connection Status">
        {voiceConnected ? (
          <WifiIcon size={12} className="telemetry-icon telemetry-icon--online" />
        ) : (
          <WifiOffIcon size={12} className="telemetry-icon telemetry-icon--offline" />
        )}
        <span className="telemetry-label">LINK</span>
        <span className={`telemetry-value telemetry-value--${voiceConnected ? 'online' : 'offline'}`}>
          {voiceConnected ? 'ACTIVE' : 'STANDBY'}
        </span>
      </div>

      <div className="telemetry-divider" />

      {/* Latency */}
      <div className="telemetry-cell" data-tooltip="Round-trip Latency">
        <SignalIcon size={12} className={`telemetry-icon telemetry-icon--${latencyClass}`} />
        <span className="telemetry-label">PING</span>
        <span className={`telemetry-value telemetry-value--${latencyClass}`}>{latency}ms</span>
      </div>

      <div className="telemetry-divider" />

      {/* Crew online */}
      <div className="telemetry-cell" data-tooltip="Online Members">
        <UsersIcon size={12} className="telemetry-icon" />
        <span className="telemetry-label">CREW</span>
        <span className="telemetry-value">{onlineCount}/{members.length}</span>
      </div>

      <div className="telemetry-divider" />

      {/* Channel */}
      <div className="telemetry-cell telemetry-cell--wide" data-tooltip="Active Channel">
        <span className="telemetry-label">CH</span>
        <span className="telemetry-value telemetry-value--accent">
          {currentChannel ? currentChannel.name.toUpperCase() : '---'}
        </span>
      </div>

      {/* Spacer */}
      <div className="telemetry-spacer" />

      {/* Data ticker — vertical marquee (top → bottom) */}
      <div className="telemetry-ticker">
        <div className="telemetry-ticker__track">
          {/* Items in reverse DOM order so the downward scroll reveals them forward */}
          <span className="telemetry-ticker__item">STELLARITY v1.0</span>
          <span className="telemetry-ticker__item">PROTOCOL: WEBRTC/DTLS-SRTP</span>
          <span className="telemetry-ticker__item">ENCRYPTION: AES-256-GCM</span>
          <span className="telemetry-ticker__item">SESSION: {uptime}</span>
          <span className="telemetry-ticker__item">OPERATOR: {user?.username?.toUpperCase() || 'UNKNOWN'}</span>
          {/* Duplicate first-visible item for seamless loop */}
          <span className="telemetry-ticker__item">STELLARITY v1.0</span>
        </div>
      </div>
    </div>
  )
}
