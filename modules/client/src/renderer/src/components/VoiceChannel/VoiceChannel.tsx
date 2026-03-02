import React, { useEffect, useState } from 'react'
import { useVoiceStore } from '../../stores/voiceStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAuthStore } from '../../stores/authStore'
import { useServerStore } from '../../stores/serverStore'
import { voiceManager } from '../../utils/voiceManager'
import {
  WaveformIcon,
  MicIcon,
  MicOffIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  PhoneIcon,
  PhoneOffIcon,
  SignalIcon,
} from '../Icons'
import './VoiceChannel.css'

interface VoiceChannelProps {
  channelId: string
  channelName: string
}

export const VoiceChannel: React.FC<VoiceChannelProps> = ({ channelId, channelName }) => {
  const { user } = useAuthStore()
  const { currentServerId } = useServerStore()
  const {
    isConnected,
    currentChannelId,
    channelUsers,
    selfMute,
    selfDeaf,
  } = useVoiceStore()
  const bitrate = useSettingsStore((s) => s.bitrate)
  const setVoiceSettings = useSettingsStore((s) => s.setVoiceSettings)

  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')

  const isInThisChannel = isConnected && currentChannelId === channelId

  useEffect(() => {
    setConnectionState(isInThisChannel ? 'connected' : 'disconnected')
  }, [isInThisChannel])

  useEffect(() => {
    voiceManager.setBitrate(bitrate)
  }, [bitrate])

  const handleJoin = async () => {
    if (!currentServerId) return
    setConnectionState('connecting')
    try {
      await voiceManager.joinChannel(channelId, currentServerId)
    } catch (err) {
      console.error('Failed to join voice:', err)
      setConnectionState('disconnected')
    }
  }

  const handleLeave = async () => {
    setConnectionState('disconnected')
    await voiceManager.leaveChannel()
  }

  const toggleMute = () => {
    voiceManager.setMuted(!selfMute)
  }

  const toggleDeaf = () => {
    voiceManager.setDeafened(!selfDeaf)
  }

  return (
    <div className="voice">
      {/* Header */}
      <div className="voice__header">
        <div className="voice__channel-info">
          <WaveformIcon size={18} className="voice__channel-icon" />
          <h2 className="voice__channel-name">{channelName}</h2>
        </div>
        <div className="voice__connection">
          <span className={`voice__status-dot voice__status-dot--${connectionState}`} />
          <span className="voice__status-text">
            {connectionState === 'disconnected' && 'Not Connected'}
            {connectionState === 'connecting' && 'Connecting...'}
            {connectionState === 'connected' && 'Voice Connected'}
          </span>
        </div>
      </div>

      <div className="voice__content">
        {!isInThisChannel ? (
          /* Join prompt */
          <div className="voice__join">
            <MicIcon size={48} className="voice__join-icon" />
            <h3>Join Voice Channel</h3>
            <p>Connect to start talking with your crew</p>
            <button className="btn btn--primary voice__join-btn" onClick={handleJoin} disabled={connectionState === 'connecting'}>
              <PhoneIcon size={16} />
              {connectionState === 'connecting' ? 'Connecting...' : 'Join Voice'}
            </button>
          </div>
        ) : (
          <>
            {/* User grid */}
            <div className="voice__grid">
              {channelUsers.map((u) => (
                <div
                  key={u.userId}
                  className={`voice-card ${u.speaking ? 'voice-card--speaking' : ''} ${u.userId === user?.id ? 'voice-card--self' : ''}`}
                >
                  <div className="voice-card__avatar avatar">
                    <span>{(u.displayName || u.username)[0].toUpperCase()}</span>
                    {u.speaking && <div className="voice-card__ring" />}
                  </div>
                  <div className="voice-card__info">
                    <span className="voice-card__name">
                      {u.displayName || u.username}
                      {u.userId === user?.id && ' (You)'}
                    </span>
                    <div className="voice-card__icons">
                      {u.selfMute && <MicOffIcon size={14} className="voice-card__icon--mute" />}
                      {u.selfDeaf && <HeadphonesOffIcon size={14} className="voice-card__icon--deaf" />}
                    </div>
                  </div>
                </div>
              ))}
              {channelUsers.length === 0 && (
                <div className="voice__no-users">No one else is here yet</div>
              )}
            </div>

            {/* Controls */}
            <div className="voice__controls panel">
              <div className="voice__controls-row">
                <button className={`voice__ctrl ${selfMute ? 'voice__ctrl--active' : ''}`} onClick={toggleMute} data-tooltip={selfMute ? 'Unmute' : 'Mute'}>
                  {selfMute ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
                  <span>{selfMute ? 'Unmute' : 'Mute'}</span>
                </button>
                <button className={`voice__ctrl ${selfDeaf ? 'voice__ctrl--active' : ''}`} onClick={toggleDeaf} data-tooltip={selfDeaf ? 'Undeafen' : 'Deafen'}>
                  {selfDeaf ? <HeadphonesOffIcon size={20} /> : <HeadphonesIcon size={20} />}
                  <span>{selfDeaf ? 'Undeafen' : 'Deafen'}</span>
                </button>
                <button className="voice__ctrl voice__ctrl--disconnect" onClick={handleLeave} data-tooltip="Disconnect">
                  <PhoneOffIcon size={20} />
                  <span>Leave</span>
                </button>
              </div>

              <div className="voice__bitrate">
                <label>
                  <span>Bitrate: {bitrate}kbps</span>
                  <input type="range" min="128" max="512" step="32" value={bitrate}
                    onChange={(e) => setVoiceSettings({ bitrate: parseInt(e.target.value) })} />
                </label>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
