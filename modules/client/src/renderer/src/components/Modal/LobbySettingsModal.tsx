import React, { useState, useEffect } from 'react'
import { Modal } from './Modal'
import { useServerStore } from '../../stores/serverStore'
import { useInstanceStore } from '../../stores/instanceStore'
import { useUIStore } from '../../stores/uiStore'
import { instanceManager } from '../../utils/instanceManager'
import { WaveformIcon, LockIcon, SignalIcon } from '../Icons'

interface LobbySettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

/** Default max bitrate fallback if instance doesn't report one (512 kbps) */
const DEFAULT_MAX_BITRATE_BPS = 512_000

/** Convert bps to kbps for display */
const toKbps = (bps: number) => Math.round(bps / 1000)

/** Convert kbps to bps for storage */
const toBps = (kbps: number) => kbps * 1000

export const LobbySettingsModal: React.FC<LobbySettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { lobbySettingsChannelId } = useUIStore()
  const { channels, currentServerId, currentInstanceId, updateChannel } = useServerStore()
  const { instanceCapabilities } = useInstanceStore()

  const channel = channels.find((c) => c.id === lobbySettingsChannelId)
  const caps = currentInstanceId ? instanceCapabilities[currentInstanceId] : undefined
  const maxBitrateBps = caps?.maxBitrate ?? DEFAULT_MAX_BITRATE_BPS
  const maxBitrateKbps = toKbps(maxBitrateBps)

  const [name, setName] = useState('')
  const [bitrateKbps, setBitrateKbps] = useState(64)
  const [userLimit, setUserLimit] = useState(0)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [removePassword, setRemovePassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate fields when modal opens or channel changes
  useEffect(() => {
    if (channel && isOpen) {
      setName(channel.name)
      setBitrateKbps(toKbps(channel.bitrate || 64000))
      setUserLimit(channel.userLimit || 0)
      setUsePassword(false)
      setPassword('')
      setRemovePassword(false)
      setError(null)
    }
  }, [channel?.id, isOpen])

  const handleClose = () => {
    setLoading(false)
    setError(null)
    onClose()
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!channel || !currentServerId || !currentInstanceId) return

    setLoading(true)
    setError(null)

    const conn = instanceManager.getInstance(currentInstanceId)
    if (!conn) {
      setError('Instance not connected')
      setLoading(false)
      return
    }

    try {
      const updates: Record<string, any> = {}

      if (name.trim() && name.trim() !== channel.name) {
        updates.name = name.trim()
      }
      const newBitrateBps = toBps(bitrateKbps)
      if (newBitrateBps !== channel.bitrate) {
        updates.bitrate = Math.min(newBitrateBps, maxBitrateBps)
      }
      if (userLimit !== channel.userLimit) {
        updates.userLimit = userLimit
      }
      if (removePassword) {
        updates.removePassword = true
      } else if (usePassword && password) {
        updates.password = password
      }

      if (Object.keys(updates).length === 0) {
        handleClose()
        return
      }

      const result = await conn.api.lobbies.update(currentServerId, channel.id, updates)
      // Optimistically update local state
      if (result.channel) {
        updateChannel(channel.id, result.channel)
      }
      handleClose()
    } catch (err: any) {
      setError(err.message || 'Failed to update lobby settings')
      setLoading(false)
    }
  }

  if (!channel) return null

  // Snap bitrate to closest step value
  const bitrateStep = 8
  const minBitrateKbps = 8

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Lobby Settings">
      <form onSubmit={handleSave} className="modal-form">
        <p className="modal-desc">
          Configure settings for <strong>{channel.name}</strong>
        </p>

        {error && <div className="form-error">{error}</div>}

        {/* Lobby Name */}
        <div className="form-group">
          <label className="form-label">
            <WaveformIcon size={12} /> Lobby Name
          </label>
          <input
            className="form-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lobby name"
            maxLength={64}
          />
        </div>

        {/* Bitrate Slider */}
        <div className="form-group">
          <label className="form-label">
            <SignalIcon size={12} /> Bitrate: {bitrateKbps} kbps
          </label>
          <input
            type="range"
            className="form-range"
            min={minBitrateKbps}
            max={maxBitrateKbps}
            step={bitrateStep}
            value={bitrateKbps}
            onChange={(e) => setBitrateKbps(parseInt(e.target.value))}
          />
          <div className="form-range-labels">
            <span>{minBitrateKbps} kbps</span>
            <span>{maxBitrateKbps} kbps</span>
          </div>
          <span className="form-hint">
            Higher bitrate = better audio quality, more bandwidth.
            {maxBitrateKbps < 512 && ` Instance max: ${maxBitrateKbps} kbps.`}
          </span>
        </div>

        {/* User Limit */}
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

        {/* Password */}
        <div className="form-group">
          {channel.hasPassword && !removePassword && (
            <>
              <span className="form-hint">This lobby is password protected.</span>
              <label className="form-label form-label--checkbox">
                <input
                  type="checkbox"
                  checked={removePassword}
                  onChange={(e) => {
                    setRemovePassword(e.target.checked)
                    if (e.target.checked) setUsePassword(false)
                  }}
                />
                Remove Password
              </label>
            </>
          )}
          {!channel.hasPassword && !removePassword && (
            <label className="form-label form-label--checkbox">
              <input
                type="checkbox"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
              />
              <LockIcon size={12} /> Set Password
            </label>
          )}
          {usePassword && !removePassword && (
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter a new password"
              maxLength={64}
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
            disabled={!name.trim() || loading}
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
