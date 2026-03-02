import React from 'react'
import { useServerStore } from '../../stores/serverStore'
import { useVoiceStore } from '../../stores/voiceStore'
import { instanceManager } from '../../utils/instanceManager'
import {
  HashIcon,
  WaveformIcon,
  ChevronIcon,
  MicOffIcon,
  HeadphonesOffIcon,
} from '../Icons'
import './ChannelListMobile.css'

interface ChannelListMobileProps {
  onSelectChannel: (channelId: string) => void
  onBack: () => void
}

export const ChannelListMobile: React.FC<ChannelListMobileProps> = ({ onSelectChannel, onBack }) => {
  const {
    currentServerId,
    channels,
    categories,
    currentChannelId,
    setCurrentChannel,
    servers,
  } = useServerStore()
  const {
    currentChannelId: voiceChannelId,
    channelUsers,
  } = useVoiceStore()

  const currentServer = servers.find(s => s.id === currentServerId)

  const handleChannelTap = (ch: typeof channels[0]) => {
    if (ch.type === 'text') {
      setCurrentChannel(ch.id)
      onSelectChannel(ch.id)
    } else {
      // Voice channel — toggle join/leave
      const conn = currentServer ? instanceManager.getInstance((currentServer as any).instanceId) : undefined
      if (voiceChannelId === ch.id) {
        conn?.socket.leaveVoiceChannel()
      } else {
        conn?.socket.joinVoiceChannel(ch.id, currentServerId!)
      }
    }
  }

  if (!currentServer) return null

  const sortedCategories = [...categories].sort((a, b) => a.position - b.position)
  const uncategorized = channels.filter(c => !c.categoryId).sort((a, b) => a.position - b.position)
  const uncategorizedText = uncategorized.filter(c => c.type === 'text')
  const uncategorizedVoice = uncategorized.filter(c => c.type === 'voice')

  const renderVoiceUsers = (channelId: string) => {
    if (voiceChannelId !== channelId || channelUsers.length === 0) return null
    return (
      <div className="m-voice-users">
        {channelUsers.map(u => (
          <div key={(u as any).oderId || (u as any).oderId} className={`m-voice-user ${u.speaking ? 'm-voice-user--speaking' : ''}`}>
            <div className="m-voice-user__avatar">
              {(u.displayName || u.username || 'U')[0].toUpperCase()}
            </div>
            <span className="m-voice-user__name">{u.displayName || u.username}</span>
            {u.selfMute && <MicOffIcon size={12} className="m-voice-user__icon" />}
            {u.selfDeaf && <HeadphonesOffIcon size={12} className="m-voice-user__icon" />}
          </div>
        ))}
      </div>
    )
  }

  const renderChannel = (ch: typeof channels[0]) => {
    const isVoice = ch.type === 'voice'
    const isActive = isVoice ? voiceChannelId === ch.id : currentChannelId === ch.id

    return (
      <React.Fragment key={ch.id}>
        <button
          className={`m-channel ${isVoice ? 'm-channel--voice' : ''} ${isActive ? 'm-channel--active' : ''}`}
          onClick={() => handleChannelTap(ch)}
        >
          {isVoice
            ? <WaveformIcon size={16} className="m-channel__icon" />
            : <HashIcon size={16} className="m-channel__icon" />
          }
          <span className="m-channel__name">{ch.name}</span>
          {isVoice && voiceChannelId === ch.id && channelUsers.length > 0 && (
            <span className="m-channel__badge">{channelUsers.length}</span>
          )}
          {!isVoice && <ChevronIcon size={12} direction="right" className="m-channel__arrow" />}
        </button>
        {isVoice && renderVoiceUsers(ch.id)}
      </React.Fragment>
    )
  }

  return (
    <div className="m-channels">
      {/* Header */}
      <div className="mobile-header">
        <button className="mobile-header__back" onClick={onBack}>
          <ChevronIcon size={16} direction="left" />
        </button>
        <span className="mobile-header__title">{currentServer.name}</span>
      </div>

      {/* Channel list */}
      <div className="m-channels__list">
        {/* Uncategorized */}
        {(uncategorizedText.length > 0 || uncategorizedVoice.length > 0) && (
          <div className="m-category">
            <div className="m-category__header">CHANNELS</div>
            {uncategorizedText.map(renderChannel)}
            {uncategorizedVoice.map(renderChannel)}
          </div>
        )}

        {/* Categorized */}
        {sortedCategories.map(cat => {
          const catChannels = channels
            .filter(c => c.categoryId === cat.id)
            .sort((a, b) => a.position - b.position)

          if (catChannels.length === 0) return null

          return (
            <div key={cat.id} className="m-category">
              <div className="m-category__header">{cat.name.toUpperCase()}</div>
              {catChannels.map(renderChannel)}
            </div>
          )
        })}

        {channels.length === 0 && (
          <div className="m-channels__empty">
            <span>No channels</span>
          </div>
        )}
      </div>
    </div>
  )
}
