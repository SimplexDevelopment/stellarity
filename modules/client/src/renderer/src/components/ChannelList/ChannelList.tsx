import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useServerStore, VoiceOccupantUser } from '../../stores/serverStore'
import { useVoiceStore } from '../../stores/voiceStore'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { instanceManager } from '../../utils/instanceManager'
import { voiceManager } from '../../utils/voiceManager'
import {
  HashIcon,
  WaveformIcon,
  PlusIcon,
  MicOffIcon,
  HeadphonesOffIcon,
  ChevronIcon,
  GearIcon,
  HourglassIcon,
  LockIcon,
  BuildLobbyIcon,
  FolderIcon,
  TrashIcon,
} from '../Icons'
import { VoiceLobby } from '../VoiceLobby'
import './ChannelList.css'

interface ChannelListProps {
  onCreateChannel: (defaultType?: 'text' | 'voice') => void
  onOpenSettings?: () => void
  onAddServer?: () => void
  onCreateLobby?: () => void
}

export const ChannelList: React.FC<ChannelListProps> = ({
  onCreateChannel,
  onOpenSettings,
  onCreateLobby,
}) => {
  const {
    currentServerId,
    currentInstanceId,
    channels,
    categories,
    currentChannelId,
    setCurrentChannel,
    setCurrentServer,
    setCategories,
    servers,
    voiceOccupancy,
    serverFeatures,
    members,
    roles,
  } = useServerStore()
  const {
    isConnected,
    currentChannelId: voiceChannelId,
    channelUsers,
    isSpeaking: localSpeaking,
  } = useVoiceStore()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const { openProfile, openLobbySettings } = useUIStore()

  // Track collapsed categories
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  // Context menu state (general sidebar)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  // Channel-specific context menu state (right-click on a voice/lobby channel)
  const [channelCtx, setChannelCtx] = useState<{ x: number; y: number; channelId: string } | null>(null)
  const channelCtxRef = useRef<HTMLDivElement>(null)

  // Drag-and-drop state
  const [dragChannelId, setDragChannelId] = useState<string | null>(null)
  const [dropTargetCatId, setDropTargetCatId] = useState<string | null>(null)
  // sentinel to distinguish uncategorized drop zone (null categoryId)
  const UNCAT = '__uncategorized__'

  // Category reorder drag state
  const [dragCatId, setDragCatId] = useState<string | null>(null)
  const [catDropTargetId, setCatDropTargetId] = useState<string | null>(null)

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!ctxMenu && !channelCtx) return
    const onClickOutside = (e: MouseEvent) => {
      if (ctxMenu && ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
      if (channelCtx && channelCtxRef.current && !channelCtxRef.current.contains(e.target as Node)) setChannelCtx(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setCtxMenu(null); setChannelCtx(null) }
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('keydown', onKey) }
  }, [ctxMenu, channelCtx])

  // Permission check: owner or has manageChannels
  const canManageChannels = (() => {
    if (!currentUserId || !currentServerId) return false
    const server = servers.find((s) => s.id === currentServerId)
    if (server?.ownerId === currentUserId) return true
    // Find the member record for the current user
    const member = members.find((m) => m.userId === currentUserId)
    if (!member) return false
    // Check if any assigned role has manageChannels
    // Members don't have explicit roleIds yet — check if any role grants it
    // For now, check the @everyone role (position 0) or any role with manageChannels
    return roles.some((r) => r.permissions?.manageChannels === true)
  })()

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!canManageChannels) return
    // Only show on empty space — not on interactive elements
    const target = e.target as HTMLElement
    if (target.closest('.channel-item, .voice-user, .category-label, .sidepanel-header, .voice-lobby, .sidepanel-empty')) return
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [canManageChannels])

  const createCategory = async (name: string) => {
    setCtxMenu(null)
    if (!currentServerId || !currentInstanceId) return
    const conn = instanceManager.getInstance(currentInstanceId)
    if (!conn) return
    try {
      const nextPos = categories.length > 0 ? Math.max(...categories.map(c => c.position)) + 1 : 0
      await conn.api.categories.create(currentServerId, { name, position: nextPos })
      const res = await conn.api.categories.list(currentServerId)
      setCategories(res.categories)
    } catch (err) {
      console.error('Failed to create category:', err)
    }
  }

  const toggleCategory = useCallback((categoryId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }, [])

  // ── Drag-and-drop handlers ─────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, channelId: string) => {
    if (!canManageChannels) { e.preventDefault(); return }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-channel', channelId)
    setDragChannelId(channelId)
  }, [canManageChannels])

  const handleDragEnd = useCallback(() => {
    setDragChannelId(null)
    setDropTargetCatId(null)
    setDragCatId(null)
    setCatDropTargetId(null)
  }, [])

  const handleCategoryDragOver = useCallback((e: React.DragEvent) => {
    if (!dragChannelId && !dragCatId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [dragChannelId, dragCatId])

  const handleCategoryDragEnter = useCallback((catId: string) => {
    if (dragChannelId) {
      setDropTargetCatId(catId)
    } else if (dragCatId && dragCatId !== catId) {
      setCatDropTargetId(catId)
    }
  }, [dragChannelId, dragCatId])

  const handleCategoryDragLeave = useCallback((e: React.DragEvent, catId: string) => {
    const related = e.relatedTarget as Node | null
    const currentTarget = e.currentTarget as Node
    if (related && currentTarget.contains(related)) return
    if (dropTargetCatId === catId) setDropTargetCatId(null)
    if (catDropTargetId === catId) setCatDropTargetId(null)
  }, [dropTargetCatId, catDropTargetId])

  const handleDrop = useCallback(async (e: React.DragEvent, targetCatId: string) => {
    e.preventDefault()
    setDropTargetCatId(null)
    setCatDropTargetId(null)

    // ── Category reorder drop ──
    const droppedCatId = e.dataTransfer.getData('application/x-category')
    if (droppedCatId && targetCatId !== UNCAT) {
      setDragCatId(null)
      if (droppedCatId === targetCatId || !currentServerId || !currentInstanceId) return
      const conn = instanceManager.getInstance(currentInstanceId)
      if (!conn) return

      const srcCat = categories.find(c => c.id === droppedCatId)
      const dstCat = categories.find(c => c.id === targetCatId)
      if (!srcCat || !dstCat) return

      // Optimistic swap positions
      const oldPos = srcCat.position
      const newPos = dstCat.position
      setCategories(categories.map(c => {
        if (c.id === droppedCatId) return { ...c, position: newPos }
        if (c.id === targetCatId) return { ...c, position: oldPos }
        return c
      }))

      try {
        await Promise.all([
          conn.api.categories.update(currentServerId, droppedCatId, { position: newPos }),
          conn.api.categories.update(currentServerId, targetCatId, { position: oldPos }),
        ])
      } catch (err) {
        console.error('Failed to reorder categories:', err)
        // Revert
        setCategories(categories)
      }
      return
    }

    // ── Channel move drop ──
    const channelId = e.dataTransfer.getData('application/x-channel')
    if (!channelId || !currentServerId || !currentInstanceId) { setDragChannelId(null); return }
    const channel = channels.find(c => c.id === channelId)
    if (!channel) { setDragChannelId(null); return }

    const newCategoryId = targetCatId === UNCAT ? null : targetCatId
    if (channel.categoryId === newCategoryId) { setDragChannelId(null); return }

    useServerStore.getState().updateChannel(channelId, { categoryId: newCategoryId })

    const conn = instanceManager.getInstance(currentInstanceId)
    if (!conn) { setDragChannelId(null); return }
    try {
      await conn.api.channels.update(currentServerId, channelId, { categoryId: newCategoryId })
    } catch (err) {
      console.error('Failed to move channel:', err)
      useServerStore.getState().updateChannel(channelId, { categoryId: channel.categoryId })
    }
    setDragChannelId(null)
  }, [currentServerId, currentInstanceId, channels, categories, setCategories, UNCAT])

  // ── Category drag start ──
  const handleCatDragStart = useCallback((e: React.DragEvent, catId: string) => {
    if (!canManageChannels) { e.preventDefault(); return }
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-category', catId)
    setDragCatId(catId)
  }, [canManageChannels])

  const currentServer = servers.find((s) => s.id === currentServerId)

  const handleChannelClick = async (ch: typeof channels[0]) => {
    if (ch.type === 'text') {
      setCurrentChannel(ch.id)
    } else {
      if (voiceChannelId === ch.id) {
        // Already connected — just focus the voice panel
        setCurrentChannel(ch.id)
      } else {
        if (voiceChannelId) {
          await voiceManager.leaveChannel()
        }
        setCurrentChannel(ch.id)
        await voiceManager.joinChannel(ch.id, currentServerId!)
      }
    }
  }

  if (!currentServer) {
    return (
      <div className="sidepanel sidepanel--empty">
        <div className="sidepanel-empty">
          <span className="sidepanel-empty__label">No server selected</span>
        </div>
      </div>
    )
  }

  // Group channels by category
  const sortedCategories = [...categories].sort((a, b) => a.position - b.position)
  const uncategorizedChannels = channels.filter((c) => !c.categoryId)
  const uncategorizedText = uncategorizedChannels.filter((c) => c.type === 'text')
  const uncategorizedVoice = uncategorizedChannels.filter((c) => c.type === 'voice')

  /** Get occupants for a voice channel from the server-wide occupancy map */
  const getVoiceOccupants = (channelId: string): VoiceOccupantUser[] => {
    // If it's the channel we're connected to, prefer the live voiceStore data
    if (voiceChannelId === channelId && channelUsers.length > 0) {
      return channelUsers.map(u => ({
        userId: u.userId,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: null,
        selfMute: u.selfMute,
        selfDeaf: u.selfDeaf,
      }))
    }
    const entry = voiceOccupancy.find(o => o.channelId === channelId)
    return entry?.users ?? []
  }

  const renderVoiceOccupants = (channelId: string) => {
    const occupants = getVoiceOccupants(channelId)
    if (occupants.length === 0) return null
    return (
      <div className="voice-users">
        {occupants.map((u) => {
          const isLocalUser = u.userId === currentUserId
          const isSpeaking = voiceChannelId === channelId
            ? (isLocalUser ? localSpeaking : channelUsers.find(cu => cu.userId === u.userId)?.speaking)
            : false
          return (
            <div
              key={u.userId}
              className={`voice-user ${isSpeaking ? 'voice-user--speaking' : ''}`}
              onClick={(e) => { e.stopPropagation(); openProfile(u.userId) }}
              role="button"
              tabIndex={0}
            >
              <div className="voice-user__avatar">
                {(u.displayName || u.username || 'U')[0].toUpperCase()}
              </div>
              <span className="voice-user__name">{u.displayName || u.username}</span>
              {u.selfMute && <MicOffIcon size={12} className="voice-user__status voice-user__status--mute" />}
              {u.selfDeaf && <HeadphonesOffIcon size={12} className="voice-user__status voice-user__status--deaf" />}
            </div>
          )
        })}
      </div>
    )
  }

  const renderChannel = (ch: typeof channels[0]) => {
    const isVoice = ch.type === 'voice'
    const isActive = isVoice ? voiceChannelId === ch.id : currentChannelId === ch.id
    const occupants = isVoice ? getVoiceOccupants(ch.id) : []
    const isDragging = dragChannelId === ch.id
    const canEditLobby = isVoice && (ch.createdBy === currentUserId || canManageChannels)

    const handleChannelContextMenu = (e: React.MouseEvent) => {
      if (!canEditLobby) return
      e.preventDefault()
      e.stopPropagation()
      setCtxMenu(null)
      setChannelCtx({ x: e.clientX, y: e.clientY, channelId: ch.id })
    }

    return (
      <React.Fragment key={ch.id}>
        <button
          className={`channel-item ${isVoice ? 'channel-item--voice' : ''} ${isActive ? 'channel-item--active' : ''} ${ch.isTemporary ? 'channel-item--temp' : ''} ${isDragging ? 'channel-item--dragging' : ''}`}
          onClick={() => handleChannelClick(ch)}
          onContextMenu={isVoice ? handleChannelContextMenu : undefined}
          draggable={canManageChannels}
          onDragStart={(e) => handleDragStart(e, ch.id)}
          onDragEnd={handleDragEnd}
        >
          {isVoice
            ? <WaveformIcon size={14} className="channel-item__icon" />
            : <HashIcon size={14} className="channel-item__icon" />
          }
          {ch.isTemporary && <HourglassIcon size={12} className="channel-item__temp-icon" />}
          <span className="channel-item__name">{ch.name}</span>
          {ch.hasPassword && <LockIcon size={12} className="channel-item__lock-icon" />}
          {isVoice && occupants.length > 0 && (
            <span className="channel-item__badge">{occupants.length}{ch.userLimit > 0 ? `/${ch.userLimit}` : ''}</span>
          )}
        </button>
        {isVoice && renderVoiceOccupants(ch.id)}
      </React.Fragment>
    )
  }

  const renderBuildLobbyButton = () => {
    if (!serverFeatures.buildALobbyEnabled || !onCreateLobby) return null
    return (
      <button
        className="channel-item channel-item--build-lobby"
        onClick={onCreateLobby}
        data-tooltip="Create a temporary voice lobby"
      >
        <BuildLobbyIcon size={14} className="channel-item__icon" />
        <span className="channel-item__name">Build a Lobby</span>
        <PlusIcon size={12} className="channel-item__add-icon" />
      </button>
    )
  }

  return (
    <div className="sidepanel">
      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button className="ctx-menu__item" onClick={() => createCategory('Relay')}>
            <HashIcon size={14} className="ctx-menu__icon" />
            <span>New Relay Category</span>
          </button>
          <button className="ctx-menu__item" onClick={() => createCategory('Comms')}>
            <WaveformIcon size={14} className="ctx-menu__icon" />
            <span>New Comms Category</span>
          </button>
          <div className="ctx-menu__sep" />
          <button className="ctx-menu__item" onClick={() => {
            setCtxMenu(null)
            onCreateChannel('text')
          }}>
            <HashIcon size={14} className="ctx-menu__icon" />
            <span>New Relay</span>
          </button>
          <button className="ctx-menu__item" onClick={() => {
            setCtxMenu(null)
            onCreateChannel('voice')
          }}>
            <WaveformIcon size={14} className="ctx-menu__icon" />
            <span>New Comms Channel</span>
          </button>
        </div>
      )}

      {/* Channel-specific context menu (right-click on voice/lobby channel) */}
      {channelCtx && (
        <div
          ref={channelCtxRef}
          className="ctx-menu"
          style={{ top: channelCtx.y, left: channelCtx.x }}
        >
          <button className="ctx-menu__item" onClick={() => {
            openLobbySettings(channelCtx.channelId)
            setChannelCtx(null)
          }}>
            <GearIcon size={14} className="ctx-menu__icon" />
            <span>Settings</span>
          </button>
          {(() => {
            const ch = channels.find(c => c.id === channelCtx.channelId)
            if (!ch?.isTemporary) return null
            return (
              <button className="ctx-menu__item ctx-menu__item--danger" onClick={async () => {
                setChannelCtx(null)
                if (!currentServerId || !currentInstanceId) return
                const conn = instanceManager.getInstance(currentInstanceId)
                if (!conn) return
                try {
                  await conn.api.channels.delete(currentServerId, channelCtx.channelId)
                } catch (err) {
                  console.error('Failed to delete lobby:', err)
                }
              }}>
                <TrashIcon size={14} className="ctx-menu__icon" />
                <span>Delete Lobby</span>
              </button>
            )
          })()}
        </div>
      )}

      {/* Server header with back button and settings gear */}
      <div className="sidepanel-header panel-header">
        <button className="sidepanel-back" onClick={() => setCurrentServer(null)} data-tooltip="Back to servers">
          <ChevronIcon size={14} direction="left" />
        </button>
        <span className="panel-header__label">{currentServer.name}</span>
        {onOpenSettings && (
          <button className="sidepanel-settings" onClick={onOpenSettings} data-tooltip="Server Settings">
            <GearIcon size={14} />
          </button>
        )}
      </div>

      {/* Channel list with collapsible categories */}
      <div className="sidepanel-channels" onContextMenu={handleContextMenu}>
        {/* Uncategorized channels */}
        {(uncategorizedText.length > 0 || uncategorizedVoice.length > 0 || dragChannelId) && (
          <div
            className={`channel-category ${dropTargetCatId === UNCAT ? 'channel-category--drop-target' : ''}`}
            onDragOver={handleCategoryDragOver}
            onDragEnter={() => handleCategoryDragEnter(UNCAT)}
            onDragLeave={(e) => handleCategoryDragLeave(e, UNCAT)}
            onDrop={(e) => handleDrop(e, UNCAT)}
          >
            <div className="category-label">
              <span>CHANNELS</span>
              <button className="category-add" onClick={() => onCreateChannel()} data-tooltip="Create Channel">
                <PlusIcon size={12} />
              </button>
            </div>
            {uncategorizedText.map(renderChannel)}
            {uncategorizedVoice.map(renderChannel)}
          </div>
        )}

        {/* Categorized channels */}
        {sortedCategories.map((cat) => {
          const catChannels = channels
            .filter((c) => c.categoryId === cat.id)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

          const isCollapsed = collapsedCategories.has(cat.id)
          const hasVoice = catChannels.some(c => c.type === 'voice')
          const voiceOccCount = catChannels
            .filter(c => c.type === 'voice')
            .reduce((sum, c) => sum + getVoiceOccupants(c.id).length, 0)

          return (
            <div
              key={cat.id}
              className={`channel-category ${dropTargetCatId === cat.id ? 'channel-category--drop-target' : ''} ${catDropTargetId === cat.id ? 'channel-category--cat-drop-target' : ''} ${dragCatId === cat.id ? 'channel-category--dragging' : ''}`}
              onDragOver={handleCategoryDragOver}
              onDragEnter={() => handleCategoryDragEnter(cat.id)}
              onDragLeave={(e) => handleCategoryDragLeave(e, cat.id)}
              onDrop={(e) => handleDrop(e, cat.id)}
            >
              <div
                className="category-label"
                onClick={() => toggleCategory(cat.id)}
                draggable={canManageChannels}
                onDragStart={(e) => handleCatDragStart(e, cat.id)}
                onDragEnd={handleDragEnd}
              >
                <ChevronIcon
                  size={10}
                  direction={isCollapsed ? 'right' : 'down'}
                  className="category-chevron"
                />
                <span>{cat.name.toUpperCase()}</span>
                {isCollapsed && voiceOccCount > 0 && (
                  <span className="category-voice-count">{voiceOccCount}</span>
                )}
                <button
                  className="category-add"
                  onClick={(e) => { e.stopPropagation(); onCreateChannel(); }}
                  data-tooltip="Create channel"
                >
                  <PlusIcon size={12} />
                </button>
              </div>
              {!isCollapsed && (
                <>
                  {catChannels.map(renderChannel)}
                  {hasVoice && renderBuildLobbyButton()}
                </>
              )}
            </div>
          )
        })}

        {channels.length === 0 && (
          <div className="sidepanel-empty">
            <span className="sidepanel-empty__label">No channels yet</span>
            <button className="btn btn--ghost" onClick={onCreateChannel}>
              <PlusIcon size={12} /> Create Channel
            </button>
          </div>
        )}
      </div>

      {/* Voice Lobby — fixed footer when connected to voice */}
      <VoiceLobby />
    </div>
  )
}
