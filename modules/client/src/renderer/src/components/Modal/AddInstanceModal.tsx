import React, { useState } from 'react'
import { Modal } from './Modal'
import { useInstanceStore } from '../../stores/instanceStore'
import { instanceManager, normalizeInstanceUrl } from '../../utils/instanceManager'
import { LinkIcon, GlobeIcon, CompassIcon, AlertCircleIcon, CheckCircleIcon, ZapIcon } from '../Icons'

interface InstanceInfo {
  id: string
  name: string
  description: string | null
  iconUrl: string | null
  memberCount?: number
  maxMembers?: number
  region?: string | null
  serverCount?: number
}

interface AddInstanceModalProps {
  isOpen: boolean
  onClose: () => void
  onConnected: (instanceId: string) => void
}

export const AddInstanceModal: React.FC<AddInstanceModalProps> = ({ isOpen, onClose, onConnected }) => {
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<'input' | 'preview' | 'connecting' | 'done' | 'error'>('input')
  const [instanceInfo, setInstanceInfo] = useState<InstanceInfo | null>(null)
  const [error, setError] = useState('')

  const { savedInstances, connectedInstanceIds } = useInstanceStore()

  const handleClose = () => {
    setUrl('')
    setPhase('input')
    setInstanceInfo(null)
    setError('')
    onClose()
  }

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setPhase('connecting')
    setError('')

    try {
      const normalizedUrl = normalizeInstanceUrl(url)
      const resp = await fetch(`${normalizedUrl}/api/instance/info`)
      if (!resp.ok) throw new Error('Could not reach instance')
      const info = await resp.json()

      const id = info.id || normalizedUrl
      const alreadySaved = savedInstances.some(i => i.id === id)

      if (alreadySaved && connectedInstanceIds.includes(id)) {
        setError('You are already connected to this instance.')
        setPhase('error')
        return
      }

      setInstanceInfo({
        id,
        name: info.name || 'Unknown Instance',
        description: info.description || null,
        iconUrl: info.iconUrl || null,
        memberCount: info.memberCount,
        maxMembers: info.maxMembers,
        region: info.region,
        serverCount: info.serverCount,
      })
      setPhase('preview')
    } catch {
      setError('Could not reach the instance. Check the address and try again. You can enter a URL, IP address, or localhost.')
      setPhase('error')
    }
  }

  const handleConnect = async () => {
    if (!instanceInfo) return

    setPhase('connecting')
    try {
      const normalizedUrl = normalizeInstanceUrl(url)
      await instanceManager.connect(instanceInfo.id, normalizedUrl, instanceInfo.name)

      useInstanceStore.getState().saveInstance({
        id: instanceInfo.id,
        name: instanceInfo.name,
        url: normalizedUrl,
        iconUrl: instanceInfo.iconUrl,
        addedAt: new Date().toISOString(),
      })
      useInstanceStore.getState().setConnected(instanceInfo.id, true)

      setPhase('done')

      // Small delay then trigger server browser
      setTimeout(() => {
        onConnected(instanceInfo.id)
        handleClose()
      }, 800)
    } catch (err: any) {
      setError(err.message || 'Failed to connect.')
      setPhase('error')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="ADD INSTANCE">
      {/* Input phase */}
      {phase === 'input' && (
        <form onSubmit={handleLookup}>
          <div className="add-instance-intro">
            <GlobeIcon size={24} className="add-instance-intro__icon" />
            <p className="add-instance-intro__text">
              Connect to an instance server by entering its address below.
              You can use a URL, IP address, or localhost.
            </p>
          </div>
          <div className="auth-field">
            <label className="auth-field__label">INSTANCE ADDRESS</label>
            <div className="add-instance-url-input">
              <LinkIcon size={14} className="add-instance-url-input__icon" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="instance.example.com or 192.168.1.10"
                required
                autoFocus
              />
            </div>
            <span className="auth-field__hint">
              Examples: https://instance.example.com, 192.168.1.10, localhost
            </span>
          </div>
          <div className="modal__actions">
            <button type="button" className="btn btn--secondary" onClick={handleClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={!url.trim()}>
              <CompassIcon size={12} /> Look Up
            </button>
          </div>
        </form>
      )}

      {/* Preview phase */}
      {phase === 'preview' && instanceInfo && (
        <div className="add-instance-preview">
          <div className="instance-preview-card">
            <div className="instance-preview-card__icon">
              {instanceInfo.iconUrl ? (
                <img src={instanceInfo.iconUrl} alt="" />
              ) : (
                <span>{instanceInfo.name.substring(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="instance-preview-card__info">
              <h3 className="instance-preview-card__name">{instanceInfo.name}</h3>
              {instanceInfo.description && (
                <p className="instance-preview-card__desc">{instanceInfo.description}</p>
              )}
              <div className="instance-preview-card__meta">
                {instanceInfo.memberCount !== undefined && (
                  <span className="instance-preview-card__stat">
                    {instanceInfo.memberCount} members
                  </span>
                )}
                {instanceInfo.serverCount !== undefined && (
                  <span className="instance-preview-card__stat">
                    {instanceInfo.serverCount} servers
                  </span>
                )}
                {instanceInfo.region && (
                  <span className="instance-preview-card__stat">
                    {instanceInfo.region}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="modal__actions">
            <button className="btn btn--secondary" onClick={() => setPhase('input')}>Back</button>
            <button className="btn btn--primary" onClick={handleConnect}>
              <ZapIcon size={12} /> Connect
            </button>
          </div>
        </div>
      )}

      {/* Connecting phase */}
      {phase === 'connecting' && (
        <div className="add-instance-status">
          <div className="add-instance-status__spinner" />
          <p className="add-instance-status__text">Establishing connection...</p>
        </div>
      )}

      {/* Done phase */}
      {phase === 'done' && (
        <div className="add-instance-status add-instance-status--success">
          <CheckCircleIcon size={32} className="add-instance-status__icon" />
          <p className="add-instance-status__text">Connected successfully!</p>
        </div>
      )}

      {/* Error phase */}
      {phase === 'error' && (
        <div className="add-instance-status add-instance-status--error">
          <AlertCircleIcon size={32} className="add-instance-status__icon" />
          <p className="add-instance-status__text">{error}</p>
          <div className="modal__actions">
            <button className="btn btn--secondary" onClick={() => { setPhase('input'); setError('') }}>
              Try Again
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
