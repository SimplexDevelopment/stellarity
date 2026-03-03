import React, { useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar/TitleBar'
import { TelemetryBar } from './components/TelemetryBar/TelemetryBar'
import { AuthScreen } from './components/Auth/Auth'
import { ChannelList } from './components/ChannelList/ChannelList'
import { ChatArea } from './components/ChatArea/ChatArea'
import { MemberList } from './components/MemberList/MemberList'
import { CreateServerModal, CreateChannelModal } from './components/Modal/Modal'
import { CreateLobbyModal } from './components/Modal/CreateLobbyModal'
import { ServerSettingsModal } from './components/Modal/ServerSettingsModal'
import { AddInstanceModal } from './components/Modal/AddInstanceModal'
import { InstanceSwitcherModal } from './components/Modal/InstanceSwitcherModal'
import { ServerBrowserModal } from './components/Modal/ServerBrowserModal'
import { UserProfileModal } from './components/Modal/UserProfileModal'
import { LobbySettingsModal } from './components/Modal/LobbySettingsModal'
import { UserSettings } from './components/UserSettings/UserSettings'
import { Discovery } from './components/Discovery/Discovery'
import { DirectMessages } from './components/DirectMessages/DirectMessages'
import { Connections } from './components/Connections/Connections'
import { MFAVerifyDialog } from './components/MFA/MFA'
import { useAuthStore } from './stores/authStore'
import { useServerStore } from './stores/serverStore'
import { useVoiceStore } from './stores/voiceStore'
import { useSettingsStore } from './stores/settingsStore'
import { useUIStore } from './stores/uiStore'
import { useInstanceStore } from './stores/instanceStore'
import { useTheme } from './hooks/useTheme'
import { centralApi } from './utils/centralApi'
import { centralSocket } from './utils/centralSocket'
import { instanceManager } from './utils/instanceManager'
import { voiceManager } from './utils/voiceManager'
import { ServerList } from './components/ServerList/ServerList'
import { DiamondIcon } from './components/Icons'
import './App.css'

// Helper to normalize key representation for comparison
const normalizeKey = (key: string): string => {
  return key.toLowerCase().replace(/^key/, '').replace(/^digit/, '')
}

// Check if a keyboard event matches a keybind
const matchesKeybind = (e: KeyboardEvent, keybind: string): boolean => {
  if (!keybind) return false
  const parts = keybind.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  const needsCtrl = parts.includes('ctrl')
  const needsShift = parts.includes('shift')
  const needsAlt = parts.includes('alt')
  const pressedKey = normalizeKey(e.code)
  const keyMatches = pressedKey === key.toLowerCase() || e.key.toLowerCase() === key.toLowerCase()
  return keyMatches && e.ctrlKey === needsCtrl && e.shiftKey === needsShift && e.altKey === needsAlt
}

const App: React.FC = () => {
  const { isAuthenticated, accessToken, setUser, mfaRequired, mfaToken } = useAuthStore()
  const { setServers, setChannels, setMembers, setCategories, setRoles, currentServerId, currentInstanceId, addServer } = useServerStore()
  const { pushToTalk, isConnected, setSelfMute, setSelfDeaf, selfMute, selfDeaf } = useVoiceStore()
  const { keybinds } = useSettingsStore()
  const { viewMode, isMemberListOpen, activeModal, closeModal, openModal } = useUIStore()
  const { savedInstances, setConnected: setInstanceConnected } = useInstanceStore()

  const [loading, setLoading] = useState(true)
  const [browseInstanceId, setBrowseInstanceId] = useState<string | null>(null)
  const [defaultChannelType, setDefaultChannelType] = useState<'text' | 'voice'>('text')

  useTheme()

  // ── Global keybinds ──────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (isConnected && pushToTalk && matchesKeybind(e, keybinds.pushToTalk) && !e.repeat) {
        e.preventDefault(); voiceManager.startPTT(); return
      }
      if (isConnected && matchesKeybind(e, keybinds.toggleMute)) {
        e.preventDefault(); const m = !selfMute; setSelfMute(m); voiceManager.setMute(m); return
      }
      if (isConnected && matchesKeybind(e, keybinds.toggleDeafen)) {
        e.preventDefault(); const d = !selfDeaf; setSelfDeaf(d); voiceManager.setDeafen(d); return
      }
      if (isConnected && matchesKeybind(e, keybinds.disconnect)) {
        e.preventDefault(); voiceManager.leaveChannel(); return
      }
      if (matchesKeybind(e, keybinds.openSettings)) {
        e.preventDefault()
        useUIStore.getState().viewMode === 'settings'
          ? useUIStore.getState().setViewMode('server')
          : useUIStore.getState().setViewMode('settings')
        return
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (isConnected && pushToTalk && matchesKeybind(e, keybinds.pushToTalk)) voiceManager.stopPTT()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp) }
  }, [isConnected, pushToTalk, keybinds, selfMute, selfDeaf, setSelfMute, setSelfDeaf])

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
      // Connect to central server (presence, DM signaling)
      centralSocket.connect(accessToken)
      
      // Check health of all saved instances, then connect to online ones
      instanceManager.checkAllSavedInstances().then(async () => {
        const { savedInstances: instances, onlineStatus } = useInstanceStore.getState()
        let firstConnectedId: string | null = null
        for (const inst of instances) {
          // Only attempt connection to instances that are online
          if (onlineStatus[inst.id] !== 'online') {
            setInstanceConnected(inst.id, false)
            continue
          }
          try {
            await instanceManager.connect(inst.id, inst.url, inst.name)
            setInstanceConnected(inst.id, true)
            if (!firstConnectedId) firstConnectedId = inst.id
          } catch (error) {
            console.error(`Failed to connect to instance ${inst.name}:`, error)
            setInstanceConnected(inst.id, false)
          }
        }
        // Auto-activate first connected instance if none is active
        if (firstConnectedId && !useInstanceStore.getState().activeInstanceId) {
          useInstanceStore.getState().setActiveInstance(firstConnectedId)
          useServerStore.getState().setCurrentInstance(firstConnectedId)
        }
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

  // ── Server / Channel creation handlers ───────────────
  const handleCreateServer = async (name: string, description: string, isPublic: boolean, password?: string) => {
    const targetInstanceId = currentInstanceId || useInstanceStore.getState().activeInstanceId
    if (!targetInstanceId) return
    const conn = instanceManager.getInstance(targetInstanceId)
    if (!conn) return
    try { const r = await conn.api.servers.create({ name, description, isPublic, password }); addServer({ ...r.server, instanceId: targetInstanceId, instanceName: conn.name }) }
    catch (e) { console.error('Failed to create server:', e) }
  }
  const handleJoinServer = async (inviteCode: string) => {
    const targetInstanceId = currentInstanceId || useInstanceStore.getState().activeInstanceId
    if (!targetInstanceId) return
    const conn = instanceManager.getInstance(targetInstanceId)
    if (!conn) return
    try { const r = await conn.api.servers.join(inviteCode); addServer({ ...r.server, instanceId: targetInstanceId, instanceName: conn.name }) }
    catch (e) { console.error('Failed to join server:', e) }
  }
  const handleCreateChannel = async (data: { name: string; type: 'text' | 'voice'; description: string; categoryId?: string; userLimit?: number; bitrate?: number }) => {
    if (!currentServerId || !currentInstanceId) return
    const conn = instanceManager.getInstance(currentInstanceId)
    if (!conn) return
    try {
      await conn.api.channels.create(currentServerId, data)
      const ch = await conn.api.channels.list(currentServerId)
      setChannels(ch.channels)
    } catch (e) { console.error('Failed to create channel:', e) }
  }

  const handleCreateLobby = async (name: string, userLimit: number, password?: string) => {
    if (!currentServerId || !currentInstanceId) return
    const conn = instanceManager.getInstance(currentInstanceId)
    if (!conn) return
    try {
      const result = await conn.api.lobbies.create(currentServerId, { name, userLimit, password })
      const channel = result.channel

      // Add channel to store immediately (socket broadcast also does this, but
      // we need it in state before we can join voice)
      useServerStore.getState().addChannel(channel)

      // Leave current voice channel if connected
      if (useVoiceStore.getState().isConnected) {
        await voiceManager.leaveChannel()
      }

      // Auto-join the creator into the new lobby
      useServerStore.getState().setCurrentChannel(channel.id)
      await voiceManager.joinChannel(channel.id, currentServerId)
    } catch (e) { console.error('Failed to create lobby:', e) }
  }

  // ── Instance modal handlers ──────────────────────────
  const handleInstanceConnected = (instanceId: string) => {
    // Activate the newly connected instance
    useInstanceStore.getState().setActiveInstance(instanceId)
    useServerStore.getState().setCurrentInstance(instanceId)
    // After connecting to a new instance, open server browser
    setBrowseInstanceId(instanceId)
    openModal('server-browser')
  }
  const handleSwitcherSelectServer = (serverId: string, instanceId: string) => {
    useInstanceStore.getState().setActiveInstance(instanceId)
    useServerStore.getState().setCurrentServer(serverId)
    useUIStore.getState().setViewMode('server')
  }

  // ── Loading state ────────────────────────────────────
  if (loading) {
    return (
      <div className="app app--loading">
        <TitleBar />
        <div className="loading-screen starfield">
          <DiamondIcon size={48} className="loading-screen__diamond" />
          <p className="loading-screen__text">Initializing Systems...</p>
        </div>
      </div>
    )
  }

  // ── MFA verification state ──────────────────────────
  if (mfaRequired && mfaToken) {
    return (
      <div className="app app--unauth">
        <TitleBar />
        <MFAVerifyDialog
          onVerified={(accessToken, refreshToken) => {
            const store = useAuthStore.getState()
            store.setMfaRequired(false)
            store.setTokens(accessToken, refreshToken)
            // Fetch user profile after MFA success
            centralApi.auth.me().then(res => {
              store.setUser(res.user)
            }).catch(console.error)
          }}
          onCancel={() => useAuthStore.getState().setMfaRequired(false)}
        />
      </div>
    )
  }

  // ── Unauthenticated state ────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="app app--unauth">
        <TitleBar />
        <AuthScreen />
      </div>
    )
  }

  // ── Authenticated shell ──────────────────────────────
  return (
    <div className="app">
      <TitleBar />
      <TelemetryBar />

      <div className="app-body">
        {/* Sidebar strip — always visible */}
        <div className="app-sidebar">
          <ServerList onAddServer={() => openModal('create-server')} />
        </div>

        {/* Channel panel — shows when a server is selected in server view */}
        {currentServerId && viewMode === 'server' && (
          <aside className="app-channelpanel">
            <ChannelList
              onCreateChannel={(type) => { if (type) setDefaultChannelType(type); openModal('create-channel') }}
              onCreateLobby={() => openModal('create-lobby')}
              onOpenSettings={() => openModal('server-settings')}
            />
          </aside>
        )}

        {/* Main Viewport */}
        <main className="app-viewport starfield grid-overlay">
          {viewMode === 'settings' && (
            <UserSettings onClose={() => useUIStore.getState().setViewMode('server')} />
          )}
          {viewMode === 'discovery' && (
            <Discovery />
          )}
          {viewMode === 'dm' && (
            <DirectMessages />
          )}
          {viewMode === 'connections' && (
            <Connections />
          )}
          {viewMode === 'server' && (
            <>
              <ChatArea />
              {/* Member List slide-in overlay */}
              <div className={`app-memberlist-overlay ${isMemberListOpen ? 'app-memberlist-overlay--open' : ''}`}>
                <MemberList />
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <CreateServerModal
        isOpen={activeModal === 'create-server'}
        onClose={closeModal}
        onCreateServer={handleCreateServer}
        onJoinServer={handleJoinServer}
      />
      <CreateChannelModal
        isOpen={activeModal === 'create-channel'}
        onClose={closeModal}
        onCreateChannel={handleCreateChannel}
        categories={useServerStore.getState().categories}
        defaultType={defaultChannelType}
      />
      <CreateLobbyModal
        isOpen={activeModal === 'create-lobby'}
        onClose={closeModal}
        onCreateLobby={handleCreateLobby}
      />
      <ServerSettingsModal
        isOpen={activeModal === 'server-settings'}
        onClose={closeModal}
      />
      <AddInstanceModal
        isOpen={activeModal === 'add-instance'}
        onClose={closeModal}
        onConnected={handleInstanceConnected}
      />
      <InstanceSwitcherModal
        isOpen={activeModal === 'instance-switcher'}
        onClose={closeModal}
        onAddInstance={() => openModal('add-instance')}
        onSelectServer={handleSwitcherSelectServer}
      />
      <ServerBrowserModal
        isOpen={activeModal === 'server-browser'}
        instanceId={browseInstanceId}
        onClose={closeModal}
        onOpenCreateServer={() => {
          if (browseInstanceId) {
            useInstanceStore.getState().setActiveInstance(browseInstanceId)
            useServerStore.getState().setCurrentInstance(browseInstanceId)
          }
          openModal('create-server')
        }}
      />
      <UserProfileModal />
      <LobbySettingsModal
        isOpen={activeModal === 'lobby-settings'}
        onClose={closeModal}
      />
    </div>
  )
}

export default App
