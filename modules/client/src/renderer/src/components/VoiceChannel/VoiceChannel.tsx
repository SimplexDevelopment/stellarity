import React, { useEffect, useState } from 'react'
import { useVoiceStore } from '../../stores/voiceStore'
import { useAuthStore } from '../../stores/authStore'
import { useServerStore } from '../../stores/serverStore'
import { useUIStore } from '../../stores/uiStore'
import { voiceManager } from '../../utils/voiceManager'
import {
  WaveformIcon,
  MicIcon,
  MicOffIcon,
  HeadphonesOffIcon,
  PhoneIcon,
} from '../Icons'
import './VoiceChannel.css'

interface VoiceChannelProps {
  channelId: string
  channelName: string
}

export const VoiceChannel: React.FC<VoiceChannelProps> = ({ channelId, channelName }) => {
  const { user } = useAuthStore()
  const { currentServerId } = useServerStore()
  const { openProfile } = useUIStore()
  const {
    isConnected,
    currentChannelId,
    channelUsers,
    selfMute,
    selfDeaf,
  } = useVoiceStore()

  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')

  const isInThisChannel = isConnected && currentChannelId === channelId

  useEffect(() => {
    setConnectionState(isInThisChannel ? 'connected' : 'disconnected')
  }, [isInThisChannel])

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
                  onClick={() => openProfile(u.userId)}
                  role="button"
                  tabIndex={0}
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


          </>
        )}
      </div>
    </div>
  )
}
