import React from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'
import { useServerStore } from '../../stores/serverStore'
import { useVoiceStore } from '../../stores/voiceStore'
import {
  CloseIcon,
  MicOffIcon,
  HeadphonesOffIcon,
  CrownIcon,
  ShieldIcon,
  WaveformIcon,
} from '../Icons'
import './UserProfileModal.css'

export const UserProfileModal: React.FC = () => {
  const { profileUserId, closeProfile } = useUIStore()
  const { user: selfUser } = useAuthStore()
  const { members, servers, currentServerId, onlineUsers, roles, channels } = useServerStore()
  const { channelUsers, currentChannelId } = useVoiceStore()

  if (!profileUserId) return null

  // Resolve user data from members list or self
  const member = members.find((m) => m.userId === profileUserId)
  const isSelf = profileUserId === selfUser?.id

  const displayName = member?.nickname
    || member?.user?.displayName
    || (isSelf ? selfUser?.displayName : null)
    || member?.user?.username
    || (isSelf ? selfUser?.username : null)
    || 'Unknown'

  const username = member?.user?.username || (isSelf ? selfUser?.username : 'unknown')
  const avatarUrl = member?.user?.avatarUrl || (isSelf ? selfUser?.avatarUrl : null)
  const statusMessage = isSelf ? selfUser?.statusMessage : null
  const isOnline = onlineUsers.has(profileUserId) || (isSelf && true)

  // Voice state
  const voiceState = channelUsers.find((u) => u.userId === profileUserId)
  const voiceChannel = voiceState
    ? channels.find((c) => c.id === currentChannelId)
    : null

  // Server membership info
  const currentServer = servers.find((s) => s.id === currentServerId)
  const isOwner = currentServer?.ownerId === profileUserId

  // Joined date (from member record)
  const joinedAt = member ? (member as any).joinedAt || (member as any).createdAt : null

  // Subscription tier
  const subscriptionTier = isSelf ? selfUser?.subscriptionTier : null

  const initial = displayName[0].toUpperCase()

  return (
    <div className="modal-overlay" onClick={closeProfile}>
      <div className="profile-modal panel" onClick={(e) => e.stopPropagation()}>
        {/* Banner / header area */}
        <div className="profile-modal__banner">
          <button className="profile-modal__close btn btn--icon" onClick={closeProfile}>
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Avatar */}
        <div className="profile-modal__avatar-wrapper">
          <div className={`profile-modal__avatar avatar ${isOnline ? '' : 'profile-modal__avatar--offline'}`}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <span className={`profile-modal__status-dot ${isOnline ? 'profile-modal__status-dot--online' : 'profile-modal__status-dot--offline'}`} />
        </div>

        {/* Identity */}
        <div className="profile-modal__identity">
          <div className="profile-modal__name-row">
            <h2 className="profile-modal__display-name">{displayName}</h2>
            {isOwner && (
              <CrownIcon size={14} className="profile-modal__badge profile-modal__badge--owner" />
            )}
          </div>
          <span className="profile-modal__username">@{username}</span>
          {statusMessage && (
            <p className="profile-modal__status-message">{statusMessage}</p>
          )}
        </div>

        {/* Divider */}
        <div className="profile-modal__divider" />

        {/* Info sections */}
        <div className="profile-modal__sections">
          {/* Online status */}
          <div className="profile-modal__section">
            <h4 className="profile-modal__section-label">STATUS</h4>
            <div className="profile-modal__status-row">
              <span className={`profile-modal__status-indicator ${isOnline ? 'profile-modal__status-indicator--online' : ''}`} />
              <span className="profile-modal__status-text">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          {/* Voice state */}
          {voiceState && voiceChannel && (
            <div className="profile-modal__section">
              <h4 className="profile-modal__section-label">VOICE</h4>
              <div className="profile-modal__voice-row">
                <WaveformIcon size={14} className="profile-modal__voice-icon" />
                <span className="profile-modal__voice-channel">{voiceChannel.name}</span>
                {voiceState.selfMute && <MicOffIcon size={12} className="profile-modal__voice-muted" />}
                {voiceState.selfDeaf && <HeadphonesOffIcon size={12} className="profile-modal__voice-deaf" />}
              </div>
            </div>
          )}

          {/* Server membership */}
          {currentServer && (
            <div className="profile-modal__section">
              <h4 className="profile-modal__section-label">MEMBER SINCE</h4>
              <span className="profile-modal__section-value">
                {joinedAt
                  ? new Date(joinedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                  : 'Unknown'}
              </span>
            </div>
          )}

          {/* Roles (if any assigned) */}
          {roles.length > 0 && (
            <div className="profile-modal__section">
              <h4 className="profile-modal__section-label">ROLES</h4>
              <div className="profile-modal__roles">
                {roles.map((role) => (
                  <span
                    key={role.id}
                    className="profile-modal__role"
                    style={{ borderColor: role.color || 'var(--text-muted)' }}
                  >
                    <span
                      className="profile-modal__role-dot"
                      style={{ background: role.color || 'var(--text-muted)' }}
                    />
                    {role.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Subscription tier (self only) */}
          {isSelf && subscriptionTier && subscriptionTier !== 'free' && (
            <div className="profile-modal__section">
              <h4 className="profile-modal__section-label">SUBSCRIPTION</h4>
              <span className="profile-modal__sub-badge">
                <ShieldIcon size={12} />
                {subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
