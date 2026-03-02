import React from 'react'
import { useVoiceStore } from '../../stores/voiceStore'
import { useServerStore } from '../../stores/serverStore'
import { instanceManager } from '../../utils/instanceManager'
import {
  MicIcon,
  MicOffIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  PhoneOffIcon,
  WaveformIcon,
} from '../Icons'
import './VoiceOverlay.css'

export const VoiceOverlay: React.FC = () => {
  const {
    isConnected,
    currentChannelId,
    selfMute,
    selfDeaf,
    channelUsers,
    setSelfMute,
    setSelfDeaf,
  } = useVoiceStore()
  const { channels, currentServerId } = useServerStore()

  if (!isConnected || !currentChannelId) return null

  const channel = channels.find(c => c.id === currentChannelId)
  const channelName = channel?.name || 'Voice Channel'

  const handleDisconnect = () => {
    const instanceId = useServerStore.getState().currentInstanceId
    const conn = instanceId ? instanceManager.getInstance(instanceId) : undefined
    conn?.socket.leaveVoiceChannel()
  }

  const speakingUsers = channelUsers.filter(u => u.speaking)

  return (
    <div className="voice-overlay">
      <div className="voice-overlay__info">
        <WaveformIcon size={14} className="voice-overlay__wave" />
        <div className="voice-overlay__details">
          <span className="voice-overlay__channel">{channelName}</span>
          <span className="voice-overlay__users">
            {channelUsers.length} connected
            {speakingUsers.length > 0 && ` · ${speakingUsers.map(u => u.displayName || u.username).join(', ')} speaking`}
          </span>
        </div>
      </div>

      <div className="voice-overlay__controls">
        <button
          className={`voice-overlay__btn ${selfMute ? 'voice-overlay__btn--active' : ''}`}
          onClick={() => setSelfMute(!selfMute)}
        >
          {selfMute ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
        </button>

        <button
          className={`voice-overlay__btn ${selfDeaf ? 'voice-overlay__btn--active' : ''}`}
          onClick={() => setSelfDeaf(!selfDeaf)}
        >
          {selfDeaf ? <HeadphonesOffIcon size={18} /> : <HeadphonesIcon size={18} />}
        </button>

        <button
          className="voice-overlay__btn voice-overlay__btn--disconnect"
          onClick={handleDisconnect}
        >
          <PhoneOffIcon size={18} />
        </button>
      </div>
    </div>
  )
}
