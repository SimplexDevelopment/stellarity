import React, { useEffect, useState, useCallback } from 'react'
import { instanceManager } from '../../utils/instanceManager'
import { useServerStore } from '../../stores/serverStore'
import {
  SearchIcon,
  UsersIcon,
  GlobeIcon,
  CompassIcon,
  LockIcon,
  RefreshIcon,
} from '../Icons'
import './Discovery.css'

interface BrowsableServer {
  id: string
  name: string
  description: string | null
  iconUrl: string | null
  memberCount: number
  isPublic: boolean
  hasPassword: boolean
  inviteCode: string | null
  isMember: boolean
}

const CATEGORIES = [
  { id: '', label: 'All' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'technology', label: 'Technology' },
  { id: 'music', label: 'Music' },
  { id: 'art', label: 'Art' },
  { id: 'science', label: 'Science' },
  { id: 'education', label: 'Education' },
  { id: 'social', label: 'Social' },
  { id: 'other', label: 'Other' },
]

const SORT_OPTIONS = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'alphabetical', label: 'A–Z' },
]

export const Discovery: React.FC = () => {
  const [browsableServers, setBrowsableServers] = useState<BrowsableServer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState('popular')
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [passwordPromptId, setPasswordPromptId] = useState<string | null>(null)
  const [password, setPassword] = useState('')

  const { currentInstanceId } = useServerStore()

  const fetchServers = useCallback(async () => {
    if (!currentInstanceId) return
    setLoading(true)
    try {
      const api = instanceManager.getApi(currentInstanceId)
      if (!api) throw new Error('Not connected to instance')
      const result = await api.servers.browse()
      setBrowsableServers(result.servers || [])
    } catch (e) {
      console.error('Server browse failed:', e)
      setBrowsableServers([])
    } finally {
      setLoading(false)
    }
  }, [currentInstanceId])

  useEffect(() => {
    fetchServers()
  }, [fetchServers])

  // Filter & sort client-side
  const filtered = browsableServers
    .filter((s) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          s.name.toLowerCase().includes(q) ||
          (s.description && s.description.toLowerCase().includes(q))
        )
      }
      return true
    })
    .sort((a, b) => {
      if (sort === 'popular') return b.memberCount - a.memberCount
      if (sort === 'newest') return 0 // no createdAt on BrowsableServer, keep original order
      if (sort === 'alphabetical') return a.name.localeCompare(b.name)
      return 0
    })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // filtering is done client-side reactively
  }

  const handleJoin = async (server: BrowsableServer, pw?: string) => {
    if (!currentInstanceId || server.isMember) return
    setJoiningId(server.id)
    try {
      const api = instanceManager.getApi(currentInstanceId)
      if (!api) throw new Error('Not connected')

      if (server.hasPassword && !pw) {
        // Show password prompt
        setPasswordPromptId(server.id)
        setJoiningId(null)
        return
      }

      await api.servers.joinPublic(server.id, pw)

      // Refresh server list for the instance
      const updated = await api.servers.list()
      const conn = instanceManager.getInstance(currentInstanceId)
      if (conn && updated.servers) {
        const tagged = updated.servers.map((s: any) => ({
          ...s,
          instanceId: currentInstanceId,
          instanceName: conn.name,
        }))
        useServerStore.getState().addInstanceServers(currentInstanceId, tagged)
      }

      // Re-fetch browsable list to update isMember flags
      await fetchServers()
      setPasswordPromptId(null)
      setPassword('')
    } catch (e) {
      console.error('Failed to join server:', e)
    } finally {
      setJoiningId(null)
    }
  }

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordPromptId) {
      const server = browsableServers.find((s) => s.id === passwordPromptId)
      if (server) handleJoin(server, password)
    }
  }

  return (
    <div className="discovery">
      {/* Header */}
      <div className="discovery-header">
        <h2 className="discovery-header__title">
          <CompassIcon size={16} /> Server Discovery
        </h2>
        <form className="discovery-search" onSubmit={handleSearch}>
          <div className="discovery-search__wrapper">
            <SearchIcon size={14} className="discovery-search__icon" />
            <input
              className="discovery-search__input"
              type="text"
              placeholder="Search servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="discovery-filter"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button className="discovery-search__btn" type="button" onClick={fetchServers} disabled={loading}>
            <RefreshIcon size={12} /> Refresh
          </button>
        </form>
      </div>

      {/* Listings */}
      <div className="discovery-content">
        {!currentInstanceId ? (
          <div className="discovery-empty">
            <GlobeIcon size={48} className="discovery-empty__icon" />
            <div className="discovery-empty__text">No instance selected</div>
            <div className="discovery-empty__sub">
              Connect to an instance to browse its public servers
            </div>
          </div>
        ) : loading ? (
          <div className="discovery-loading">
            Scanning subspace frequencies...
          </div>
        ) : filtered.length === 0 ? (
          <div className="discovery-empty">
            <GlobeIcon size={48} className="discovery-empty__icon" />
            <div className="discovery-empty__text">No servers found</div>
            <div className="discovery-empty__sub">
              {searchQuery
                ? 'Try a different search query'
                : 'No public servers available on this instance'}
            </div>
          </div>
        ) : (
          <div className="discovery-grid">
            {filtered.map((server) => {
              const isJoining = joiningId === server.id
              return (
                <div className="instance-card" key={server.id}>
                  <div className="instance-card__banner">
                    <div className="instance-card__icon">
                      {server.iconUrl ? (
                        <img src={server.iconUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: 6 }} />
                      ) : (
                        server.name.substring(0, 2).toUpperCase()
                      )}
                    </div>
                  </div>
                  <div className="instance-card__body">
                    <h3 className="instance-card__name">
                      {server.name}
                      {server.hasPassword && <LockIcon size={12} className="instance-card__lock" />}
                    </h3>
                    <p className="instance-card__desc">
                      {server.description || 'No description provided'}
                    </p>
                    <div className="instance-card__meta">
                      <span className="instance-card__meta-item">
                        <UsersIcon size={12} />
                        {server.memberCount} members
                      </span>
                    </div>
                  </div>
                  <div className="instance-card__footer">
                    {passwordPromptId === server.id ? (
                      <form className="instance-card__pw-form" onSubmit={handlePasswordSubmit}>
                        <input
                          className="instance-card__pw-input"
                          type="password"
                          placeholder="Password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoFocus
                        />
                        <button className="instance-card__join" type="submit" disabled={isJoining}>
                          {isJoining ? 'Joining...' : 'Go'}
                        </button>
                        <button
                          className="instance-card__join instance-card__join--cancel"
                          type="button"
                          onClick={() => { setPasswordPromptId(null); setPassword('') }}
                        >
                          ✕
                        </button>
                      </form>
                    ) : (
                      <button
                        className={`instance-card__join ${server.isMember ? 'instance-card__join--connected' : ''}`}
                        disabled={server.isMember || isJoining}
                        onClick={() => handleJoin(server)}
                      >
                        {server.isMember ? 'Joined' : isJoining ? 'Joining...' : 'Join'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
