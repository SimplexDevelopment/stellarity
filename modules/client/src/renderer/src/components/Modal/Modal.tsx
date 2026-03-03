import React, { useState, useEffect } from 'react'
import { CloseIcon, ServerIcon, PlusIcon, HashIcon, WaveformIcon, GlobeIcon, LockIcon, KeyIcon } from '../Icons'
import './Modal.css'

/* ── Base Modal ───────────────────────────────────────── */
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header panel-header">
          <span className="panel-header__label">{title}</span>
          <button className="btn btn--icon" onClick={onClose}><CloseIcon size={14} /></button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}

/* ── Create Server Modal ──────────────────────────────── */
interface CreateServerModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateServer: (name: string, description: string, isPublic: boolean, password?: string) => void
  onJoinServer: (inviteCode: string) => void
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({ isOpen, onClose, onCreateServer, onJoinServer }) => {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    await onCreateServer(name, description, isPublic, usePassword ? password : undefined)
    setLoading(false); handleClose()
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    await onJoinServer(inviteCode)
    setLoading(false); handleClose()
  }

  const handleClose = () => { setMode('choose'); setName(''); setDescription(''); setIsPublic(true); setUsePassword(false); setPassword(''); setInviteCode(''); onClose() }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="ADD SERVER">
      {mode === 'choose' && (
        <div className="modal-options">
          <button className="modal-option" onClick={() => setMode('create')}>
            <ServerIcon size={28} className="modal-option__icon" />
            <span className="modal-option__title">Create a Server</span>
            <span className="modal-option__desc">Start a new communication hub</span>
          </button>
          <button className="modal-option" onClick={() => setMode('join')}>
            <PlusIcon size={28} className="modal-option__icon" />
            <span className="modal-option__title">Join a Server</span>
            <span className="modal-option__desc">Enter an invite code</span>
          </button>
        </div>
      )}

      {mode === 'create' && (
        <form onSubmit={handleCreate}>
          <div className="auth-field">
            <label className="auth-field__label">SERVER NAME</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Server" required maxLength={64} autoFocus />
          </div>
          <div className="auth-field">
            <label className="auth-field__label">DESCRIPTION (OPTIONAL)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this server about?" maxLength={500} rows={3} />
          </div>
          <div className="auth-field">
            <label className="auth-field__label">VISIBILITY</label>
            <div className="modal-type-selector">
              <button type="button" className={`modal-type-option ${isPublic ? 'active' : ''}`}
                onClick={() => setIsPublic(true)}>
                <GlobeIcon size={14} /> Public
              </button>
              <button type="button" className={`modal-type-option ${!isPublic ? 'active' : ''}`}
                onClick={() => { setIsPublic(false); setUsePassword(false); setPassword('') }}>
                <LockIcon size={14} /> Invite Only
              </button>
            </div>
          </div>
          {isPublic && (
            <div className="auth-field">
              <label className="auth-field__label auth-field__label--row">
                <input type="checkbox" checked={usePassword}
                  onChange={(e) => { setUsePassword(e.target.checked); if (!e.target.checked) setPassword('') }} />
                <KeyIcon size={12} /> PASSWORD PROTECT
              </label>
              {usePassword && (
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Server password" required minLength={4} maxLength={128} />
              )}
            </div>
          )}
          <div className="modal__actions">
            <button type="button" className="btn btn--secondary" onClick={() => setMode('choose')}>Back</button>
            <button type="submit" className="btn btn--primary" disabled={loading || !name || (usePassword && !password)}>
              {loading ? 'Creating...' : 'Create Server'}
            </button>
          </div>
        </form>
      )}

      {mode === 'join' && (
        <form onSubmit={handleJoin}>
          <div className="auth-field">
            <label className="auth-field__label">INVITE CODE</label>
            <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Enter invite code" required autoFocus />
          </div>
          <div className="modal__actions">
            <button type="button" className="btn btn--secondary" onClick={() => setMode('choose')}>Back</button>
            <button type="submit" className="btn btn--primary" disabled={loading || !inviteCode}>
              {loading ? 'Joining...' : 'Join Server'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/* ── Create Channel Modal ─────────────────────────────── */
interface CreateChannelModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateChannel: (data: {
    name: string
    type: 'text' | 'voice'
    description: string
    categoryId?: string
    userLimit?: number
    bitrate?: number
  }) => void
  categories?: { id: string; name: string; position: number }[]
  defaultType?: 'text' | 'voice'
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({ isOpen, onClose, onCreateChannel, categories = [], defaultType = 'text' }) => {
  const [name, setName] = useState('')
  const [type, setType] = useState<'text' | 'voice'>(defaultType)
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [userLimit, setUserLimit] = useState(0)
  const [bitrate, setBitrate] = useState(64000)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    await onCreateChannel({
      name,
      type,
      description,
      categoryId: categoryId || undefined,
      userLimit: type === 'voice' ? userLimit : undefined,
      bitrate: type === 'voice' ? bitrate : undefined,
    })
    setLoading(false); handleClose()
  }

  const handleClose = () => { setName(''); setType(defaultType); setDescription(''); setCategoryId(''); setUserLimit(0); setBitrate(64000); onClose() }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="CREATE CHANNEL">
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="auth-field__label">CHANNEL TYPE</label>
          <div className="modal-type-selector">
            <button type="button" className={`modal-type-option ${type === 'text' ? 'active' : ''}`} onClick={() => setType('text')}>
              <HashIcon size={16} /> Text
            </button>
            <button type="button" className={`modal-type-option ${type === 'voice' ? 'active' : ''}`} onClick={() => setType('voice')}>
              <WaveformIcon size={16} /> Voice
            </button>
          </div>
        </div>
        <div className="auth-field">
          <label className="auth-field__label">CHANNEL NAME</label>
          <input type="text" value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            placeholder={type === 'text' ? 'new-channel' : 'Voice Channel'}
            required maxLength={64} autoFocus />
        </div>
        {categories.length > 0 && (
          <div className="auth-field">
            <label className="auth-field__label">CATEGORY</label>
            <select
              className="form-input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">No category</option>
              {categories
                .sort((a, b) => a.position - b.position)
                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              }
            </select>
          </div>
        )}
        <div className="auth-field">
          <label className="auth-field__label">DESCRIPTION (OPTIONAL)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this channel for?" maxLength={500} rows={2} />
        </div>
        {type === 'voice' && (
          <>
            <div className="auth-field">
              <label className="auth-field__label">USER LIMIT</label>
              <input type="number" value={userLimit}
                onChange={(e) => setUserLimit(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
                min={0} max={99} placeholder="0 = unlimited" />
              <span className="form-hint" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                0 = no limit, max 99
              </span>
            </div>
            <div className="auth-field">
              <label className="auth-field__label">BITRATE</label>
              <select className="form-input" value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))}>
                <option value={8000}>8 kbps</option>
                <option value={16000}>16 kbps</option>
                <option value={32000}>32 kbps</option>
                <option value={64000}>64 kbps (default)</option>
                <option value={96000}>96 kbps</option>
                <option value={128000}>128 kbps</option>
                <option value={256000}>256 kbps</option>
                <option value={384000}>384 kbps</option>
              </select>
            </div>
          </>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={handleClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={loading || !name}>
            {loading ? 'Creating...' : 'Create Channel'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
