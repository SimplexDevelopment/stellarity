import React from 'react'
import { useVoiceStore } from '../../stores/voiceStore'
import { useAuthStore } from '../../stores/authStore'
import { useServerStore } from '../../stores/serverStore'
import { useUIStore } from '../../stores/uiStore'
import { voiceManager } from '../../utils/voiceManager'
import {
  SignalIcon,
  MicIcon,
  MicOffIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  PhoneOffIcon,
} from '../Icons'
import './VoiceLobby.css'

export const VoiceLobby: React.FC = () => {
  const { user } = useAuthStore()
  const { channels } = useServerStore()
  const { openProfile } = useUIStore()
  const {
    isConnected,
    currentChannelId,
    channelUsers,
    selfMute,
    selfDeaf,
    isSpeaking,
  } = useVoiceStore()

  if (!isConnected || !currentChannelId) return null

  const currentChannel = channels.find((c) => c.id === currentChannelId)

  const toggleMute = () => {
    voiceManager.setMuted(!selfMute)
  }

  const toggleDeaf = () => {
    voiceManager.setDeafened(!selfDeaf)
  }

  const handleDisconnect = () => {
    voiceManager.leaveChannel()
  }

  return (
    <div className="voice-lobby">
      {/* Connection header */}
      <div className="voice-lobby__header">
        <SignalIcon size={14} className="voice-lobby__signal" />
        <div className="voice-lobby__info">
          <span className="voice-lobby__status">Voice Connected</span>
          <span className="voice-lobby__channel">
            {currentChannel?.name || 'Unknown Channel'}
          </span>
        </div>
      </div>

      {/* User list */}
      <div className="voice-lobby__users">
        {channelUsers.map((u) => {
          const isLocal = u.userId === user?.id
          const speaking = isLocal ? isSpeaking : u.speaking

          return (
            <div
              key={u.userId}
              className={`voice-lobby__user ${speaking ? 'voice-lobby__user--speaking' : ''}`}
              onClick={() => openProfile(u.userId)}
              role="button"
              tabIndex={0}
            >
              <div className="voice-lobby__avatar">
                <span>{(u.displayName || u.username)[0].toUpperCase()}</span>
                {speaking && <div className="voice-lobby__speak-ring" />}
              </div>
              <span className="voice-lobby__name">
                {u.displayName || u.username}
              </span>
              <div className="voice-lobby__indicators">
                {u.selfMute && <MicOffIcon size={12} className="voice-lobby__icon--muted" />}
                {u.selfDeaf && <HeadphonesOffIcon size={12} className="voice-lobby__icon--deaf" />}
              </div>
            </div>
          )
        })}
      </div>

      {/* Controls */}
      <div className="voice-lobby__controls">
        <button
          className={`voice-lobby__btn ${selfMute ? 'voice-lobby__btn--danger' : ''}`}
          onClick={toggleMute}
          data-tooltip={selfMute ? 'Unmute' : 'Mute'}
        >
          {selfMute ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
        </button>

        <button
          className={`voice-lobby__btn ${selfDeaf ? 'voice-lobby__btn--danger' : ''}`}
          onClick={toggleDeaf}
          data-tooltip={selfDeaf ? 'Undeafen' : 'Deafen'}
        >
          {selfDeaf ? <HeadphonesOffIcon size={16} /> : <HeadphonesIcon size={16} />}
        </button>

        <button
          className="voice-lobby__btn voice-lobby__btn--disconnect"
          onClick={handleDisconnect}
          data-tooltip="Disconnect"
        >
          <PhoneOffIcon size={16} />
        </button>
      </div>
    </div>
  )
}
