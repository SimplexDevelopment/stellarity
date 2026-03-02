import React from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useVoiceStore } from '../../stores/voiceStore'
import { useServerStore } from '../../stores/serverStore'
import { instanceManager } from '../../utils/instanceManager'
import { voiceManager } from '../../utils/voiceManager'
import {
  MicIcon,
  MicOffIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  PhoneOffIcon,
  WaveformIcon,
  SignalIcon,
} from '../Icons'
import './StatusDock.css'

export const StatusDock: React.FC = () => {
  const { user } = useAuthStore()
  const {
    isConnected,
    currentChannelId,
    selfMute,
    selfDeaf,
    setSelfMute,
    setSelfDeaf,
    isSpeaking,
    channelUsers,
  } = useVoiceStore()
  const { channels } = useServerStore()

  const currentChannel = channels.find((c) => c.id === currentChannelId)

  const getInstanceSocket = () => {
    const instanceId = useServerStore.getState().currentInstanceId
    return instanceId ? instanceManager.getSocket(instanceId) : undefined
  }

  const toggleMute = () => {
    const next = !selfMute
    setSelfMute(next)
    voiceManager.setMuted(next)
    getInstanceSocket()?.updateVoiceState(next, selfDeaf)
  }

  const toggleDeaf = () => {
    const next = !selfDeaf
    setSelfDeaf(next)
    voiceManager.setDeafened(next)
    getInstanceSocket()?.updateVoiceState(next ? true : selfMute, next)
  }

  const handleDisconnect = () => {
    voiceManager.cleanup()
    getInstanceSocket()?.leaveVoiceChannel()
  }

  return (
    <div className="statusdock">
      {/* User badge */}
      <div className="statusdock-user">
        <div className="statusdock-avatar">
          {user?.username?.[0]?.toUpperCase() || 'U'}
          <span className="statusdock-status-dot" />
        </div>
        <div className="statusdock-userinfo">
          <span className="statusdock-username">{user?.displayName || user?.username}</span>
          <span className="statusdock-usertag">#{user?.id?.slice(0, 6)}</span>
        </div>
      </div>

      {/* Voice panel — only when connected */}
      {isConnected && (
        <>
          <div className="statusdock-divider" />

          <div className="statusdock-voice">
            <div className="statusdock-voice-info">
              <SignalIcon size={12} className="statusdock-voice-signal" />
              <span className="statusdock-voice-label">
                {currentChannel ? currentChannel.name : 'Voice'}
              </span>
              <span className="statusdock-voice-count">{channelUsers.length}</span>
            </div>

            {isSpeaking && (
              <WaveformIcon size={14} className="statusdock-speaking-icon" />
            )}
          </div>

          <div className="statusdock-voice-controls">
            <button
              className={`statusdock-ctrl ${selfMute ? 'statusdock-ctrl--danger' : ''}`}
              onClick={toggleMute}
              data-tooltip={selfMute ? 'Unmute' : 'Mute'}
            >
              {selfMute ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
            </button>

            <button
              className={`statusdock-ctrl ${selfDeaf ? 'statusdock-ctrl--danger' : ''}`}
              onClick={toggleDeaf}
              data-tooltip={selfDeaf ? 'Undeafen' : 'Deafen'}
            >
              {selfDeaf ? <HeadphonesOffIcon size={16} /> : <HeadphonesIcon size={16} />}
            </button>

            <button
              className="statusdock-ctrl statusdock-ctrl--disconnect"
              onClick={handleDisconnect}
              data-tooltip="Disconnect"
            >
              <PhoneOffIcon size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
