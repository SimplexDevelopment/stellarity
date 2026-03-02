import React, { useEffect, useState } from 'react'
import { AuthScreen } from './components/Auth/Auth'
import { BottomTabs } from './components/Navigation/BottomTabs'
import { CommsView } from './components/Comms/CommsView'
import { ChatView } from './components/Chat/ChatView'
import { VoiceOverlay } from './components/Voice/VoiceOverlay'
import { SettingsView } from './components/Settings/SettingsView'
import { DMsView } from './components/DMs/DMsView'
import { useAuthStore } from './stores/authStore'
import { useServerStore } from './stores/serverStore'
import { useVoiceStore } from './stores/voiceStore'
import { useUIStore } from './stores/uiStore'
import { useInstanceStore } from './stores/instanceStore'
import { useTheme } from './hooks/useTheme'
import { centralApi } from './utils/centralApi'
import { centralSocket } from './utils/centralSocket'
import { instanceManager } from './utils/instanceManager'
import { DiamondIcon } from './components/Icons'
import './App.css'

type MobileTab = 'comms' | 'dms' | 'settings'
type CommsScreen = 'servers' | 'channels' | 'chat'

const App: React.FC = () => {
  const { isAuthenticated, accessToken, setUser } = useAuthStore()
  const {
    setServers, setChannels, setMembers, setCategories, setRoles,
    currentServerId, currentInstanceId, currentChannelId, addServer,
    setCurrentServer, setCurrentChannel,
  } = useServerStore()
  const { isConnected: voiceConnected } = useVoiceStore()
  const { setConnected: setInstanceConnected } = useInstanceStore()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<MobileTab>('comms')
  const [commsScreen, setCommsScreen] = useState<CommsScreen>('servers')

  useTheme()

  // ── API token getter ─────────────────────────────────
  useEffect(() => {
    centralApi.setTokenGetter(() => useAuthStore.getState().accessToken)
  }, [])

  // ── Auth check on mount ──────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      if (accessToken) {
        try {
          const response = await centralApi.auth.me()
          setUser(response.user)
        } catch (error) {
          console.error('Auth check failed:', error)
        }
      }
      setLoading(false)
    }
    checkAuth()
  }, [])

  // ── Central socket + instance connections ─────────────
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      centralSocket.connect(accessToken)

      instanceManager.checkAllSavedInstances().then(() => {
        const { savedInstances: instances, onlineStatus } = useInstanceStore.getState()
        instances.forEach(async (inst) => {
          if (onlineStatus[inst.id] !== 'online') {
            setInstanceConnected(inst.id, false)
            return
          }
          try {
            await instanceManager.connect(inst.id, inst.url, inst.name)
            setInstanceConnected(inst.id, true)
          } catch (error) {
            console.error(`Failed to connect to instance ${inst.name}:`, error)
            setInstanceConnected(inst.id, false)
          }
        })
      })
    } else {
      centralSocket.disconnect()
      instanceManager.disconnectAll()
    }
    return () => {
      centralSocket.disconnect()
      instanceManager.disconnectAll()
    }
  }, [isAuthenticated, accessToken])

  // ── Server data loading ──────────────────────────────
  useEffect(() => {
    if (currentServerId && currentInstanceId) {
      const conn = instanceManager.getInstance(currentInstanceId)
      if (conn) {
        conn.socket.joinServer(currentServerId)
        Promise.all([
          conn.api.channels.list(currentServerId),
          conn.api.servers.getMembers(currentServerId),
          conn.api.categories.list(currentServerId),
          conn.api.roles.list(currentServerId),
        ]).then(([ch, mb, cat, rl]) => {
          setChannels(ch.channels)
          setMembers(mb.members)
          setCategories(cat.categories)
          setRoles(rl.roles)
        })
      }
    }
  }, [currentServerId, currentInstanceId])

  // ── Navigation helpers ───────────────────────────────
  const handleSelectServer = (serverId: string) => {
    setCurrentServer(serverId)
    setCommsScreen('channels')
  }

  const handleSelectChannel = (channelId: string) => {
    setCurrentChannel(channelId)
    setCommsScreen('chat')
  }

  const handleBackToServers = () => {
    setCommsScreen('servers')
  }

  const handleBackToChannels = () => {
    setCommsScreen('channels')
  }

  // ── Loading state ────────────────────────────────────
  if (loading) {
    return (
      <div className="mobile-app mobile-app--loading">
        <div className="mobile-loading">
          <DiamondIcon size={48} className="mobile-loading__icon" />
          <p className="mobile-loading__text">Initializing Systems...</p>
        </div>
      </div>
    )
  }

  // ── Unauthenticated state ────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="mobile-app mobile-app--auth">
        <AuthScreen />
      </div>
    )
  }

  // ── Authenticated shell ──────────────────────────────
  return (
    <div className="mobile-app">
      {/* Voice overlay — always visible when in call */}
      {voiceConnected && <VoiceOverlay />}

      {/* Main content area */}
      <div className="mobile-content">
        {activeTab === 'comms' && (
          <>
            {commsScreen === 'servers' && (
              <CommsView
                onSelectServer={handleSelectServer}
                onAddServer={() => useUIStore.getState().openModal('create-server')}
              />
            )}
            {commsScreen === 'channels' && currentServerId && (
              <ChannelsScreen
                onSelectChannel={handleSelectChannel}
                onBack={handleBackToServers}
              />
            )}
            {commsScreen === 'chat' && currentChannelId && (
              <ChatView onBack={handleBackToChannels} />
            )}
          </>
        )}
        {activeTab === 'dms' && (
          <DMsView />
        )}
        {activeTab === 'settings' && (
          <SettingsView />
        )}
      </div>

      {/* Bottom navigation — hidden when in chat */}
      {!(activeTab === 'comms' && commsScreen === 'chat') && (
        <BottomTabs activeTab={activeTab} onTabChange={setActiveTab} />
      )}
    </div>
  )
}

/* ── ChannelsScreen (inline) ──────────────────────────── */
import { ChannelListMobile } from './components/Comms/ChannelListMobile'

const ChannelsScreen: React.FC<{
  onSelectChannel: (id: string) => void
  onBack: () => void
}> = ({ onSelectChannel, onBack }) => {
  return <ChannelListMobile onSelectChannel={onSelectChannel} onBack={onBack} />
}

export default App
