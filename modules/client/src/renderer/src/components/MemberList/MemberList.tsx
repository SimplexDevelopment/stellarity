import React from 'react'
import { useServerStore } from '../../stores/serverStore'
import { useUIStore } from '../../stores/uiStore'
import { CloseIcon } from '../Icons'
import './MemberList.css'

export const MemberList: React.FC = () => {
  const { members, onlineUsers } = useServerStore()
  const { toggleMemberList, openProfile } = useUIStore()

  const onlineMembers = members.filter((m) => onlineUsers.has(m.userId))
  const offlineMembers = members.filter((m) => !onlineUsers.has(m.userId))

  return (
    <div className="members panel">
      <div className="members__header panel-header">
        <span className="panel-header__label">CREW MANIFEST</span>
        <button className="btn btn--icon" onClick={toggleMemberList} data-tooltip="Close">
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="members__list">
        {onlineMembers.length > 0 && (
          <div className="members__group">
            <div className="category-label">
              <span className="category-label__text">ONLINE — {onlineMembers.length}</span>
            </div>
            {onlineMembers.map((m) => (
              <MemberItem key={m.id} member={m} online onClick={() => openProfile(m.userId)} />
            ))}
          </div>
        )}

        {offlineMembers.length > 0 && (
          <div className="members__group">
            <div className="category-label">
              <span className="category-label__text">OFFLINE — {offlineMembers.length}</span>
            </div>
            {offlineMembers.map((m) => (
              <MemberItem key={m.id} member={m} online={false} onClick={() => openProfile(m.userId)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface MemberItemProps {
  member: {
    id: string
    userId: string
    nickname: string | null
    user: {
      username: string
      displayName: string | null
      avatarUrl: string | null
      status: string
    }
  }
  online: boolean
  onClick?: () => void
}

const MemberItem: React.FC<MemberItemProps> = ({ member, online, onClick }) => {
  const displayName = member.nickname || member.user.displayName || member.user.username
  const initial = displayName[0].toUpperCase()

  return (
    <div className={`member ${online ? '' : 'member--offline'}`} onClick={onClick} role="button" tabIndex={0}>
      <div className="member__avatar avatar avatar--sm">
        {member.user.avatarUrl ? (
          <img src={member.user.avatarUrl} alt={displayName} />
        ) : (
          <span>{initial}</span>
        )}
        <span className={`status-dot ${online ? 'status-dot--online' : 'status-dot--offline'}`} />
      </div>
      <div className="member__info">
        <span className="member__name">{displayName}</span>
        {member.user.status && member.user.status !== 'offline' && online && (
          <span className="member__status">{member.user.status}</span>
        )}
      </div>
    </div>
  )
}
