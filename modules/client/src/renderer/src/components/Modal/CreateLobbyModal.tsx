import React, { useState } from 'react'
import { Modal } from './Modal'
import { BuildLobbyIcon, LockIcon, WaveformIcon } from '../Icons'

interface CreateLobbyModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateLobby: (name: string, userLimit: number, password?: string) => void
}

export const CreateLobbyModal: React.FC<CreateLobbyModalProps> = ({
  isOpen,
  onClose,
  onCreateLobby,
}) => {
  const [name, setName] = useState('')
  const [userLimit, setUserLimit] = useState(0)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleClose = () => {
    setName('')
    setUserLimit(0)
    setUsePassword(false)
    setPassword('')
    setLoading(false)
    onClose()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await onCreateLobby(name.trim(), userLimit, usePassword ? password : undefined)
      handleClose()
    } catch {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Build a Lobby">
      <form onSubmit={handleCreate} className="modal-form">
        <p className="modal-desc">
          Create a temporary voice lobby. It will self-destruct when everyone leaves.
        </p>

        <div className="form-group">
          <label className="form-label">
            <WaveformIcon size={12} /> Lobby Name
          </label>
          <input
            className="form-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Raid Party, Chill Zone"
            maxLength={64}
            autoFocus
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">User Limit</label>
          <input
            className="form-input"
            type="number"
            value={userLimit}
            onChange={(e) => setUserLimit(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
            min={0}
            max={99}
            placeholder="0 = unlimited"
          />
          <span className="form-hint">0 = no limit, max 99</span>
        </div>

        <div className="form-group">
          <label className="form-label form-label--checkbox">
            <input
              type="checkbox"
              checked={usePassword}
              onChange={(e) => setUsePassword(e.target.checked)}
            />
            <LockIcon size={12} /> Password Protected
          </label>
          {usePassword && (
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter a password"
              maxLength={64}
              required
            />
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!name.trim() || loading || (usePassword && !password)}
          >
            <BuildLobbyIcon size={14} />
            {loading ? 'Creating...' : 'Create Lobby'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
