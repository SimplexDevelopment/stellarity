import React, { useState, useRef, useEffect } from 'react'
import { centralApi } from '../../utils/centralApi'
import { useAuthStore } from '../../stores/authStore'
import { ShieldIcon, CloseIcon, KeyIcon } from '../Icons'
import './MFA.css'

// ── MFA Setup Dialog (for settings page) ──────────────────
interface MFASetupProps {
  isOpen: boolean
  onClose: () => void
  onEnabled: () => void
}

export const MFASetupDialog: React.FC<MFASetupProps> = ({ isOpen, onClose, onEnabled }) => {
  const [step, setStep] = useState<'qr' | 'verify' | 'backup'>('qr')
  const [qrUrl, setQrUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const digitRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (isOpen) {
      setupMFA()
    }
    return () => {
      setStep('qr')
      setCode(['', '', '', '', '', ''])
      setError('')
    }
  }, [isOpen])

  const setupMFA = async () => {
    try {
      const result = await centralApi.auth.setupMFA()
      setQrUrl(result.qrCodeUrl)
      setSecret(result.secret)
    } catch (e) {
      setError('Failed to initialize MFA setup')
    }
  }

  const handleDigitChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1)
    if (value && !/^\d$/.test(value)) return

    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)
    setError('')

    // Auto-advance
    if (value && index < 5) {
      digitRefs.current[index + 1]?.focus()
    }
  }

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      digitRefs.current[index - 1]?.focus()
    }
  }

  const handleVerify = async () => {
    const token = code.join('')
    if (token.length !== 6) {
      setError('Enter all 6 digits')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await centralApi.auth.verifyMFA(token)
      if (result.backupCodes) {
        setBackupCodes(result.backupCodes)
        setStep('backup')
      } else {
        onEnabled()
        onClose()
      }
    } catch (e) {
      setError('Invalid code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret)
  }

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'))
  }

  if (!isOpen) return null

  return (
    <div className="mfa-overlay" onClick={onClose}>
      <div className="mfa-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="mfa-dialog__header">
          <span className="mfa-dialog__title">
            <ShieldIcon size={16} />
            {step === 'backup' ? 'Backup Codes' : 'Enable Two-Factor Authentication'}
          </span>
          <button className="mfa-dialog__close" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="mfa-dialog__body">
          {step === 'qr' && (
            <div className="mfa-step">
              <p className="mfa-step__label">
                Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </p>
              {qrUrl && (
                <div className="mfa-step__qr">
                  <img src={qrUrl} alt="MFA QR Code" width={200} height={200} />
                </div>
              )}
              <p className="mfa-step__label">Or enter this secret manually:</p>
              <div className="mfa-step__secret" onClick={handleCopySecret} title="Click to copy">
                {secret}
              </div>
              <p className="mfa-step__secret-hint">Click to copy</p>
            </div>
          )}

          {step === 'verify' && (
            <div className="mfa-step">
              <p className="mfa-step__label">
                Enter the 6-digit code from your authenticator app
              </p>
              <div className="mfa-code">
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { digitRefs.current[i] = el }}
                    className="mfa-code__digit"
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    autoFocus={i === 0}
                  />
                ))}
              </div>
              {error && <div className="mfa-error">{error}</div>}
            </div>
          )}

          {step === 'backup' && (
            <div className="mfa-step">
              <p className="mfa-step__label">
                Save these backup codes in a safe place. Each code can be used once if you lose access to your authenticator.
              </p>
              <div className="mfa-backup">
                <div className="mfa-backup__grid">
                  {backupCodes.map((bc, i) => (
                    <div className="mfa-backup__code" key={i}>{bc}</div>
                  ))}
                </div>
                <div className="mfa-backup__warning">
                  ⚠ These codes will not be shown again
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mfa-dialog__footer">
          {step === 'qr' && (
            <button
              className="mfa-btn mfa-btn--primary"
              onClick={() => setStep('verify')}
            >
              I've scanned the code
            </button>
          )}
          {step === 'verify' && (
            <>
              <button
                className="mfa-btn mfa-btn--secondary"
                onClick={() => setStep('qr')}
              >
                Back
              </button>
              <button
                className="mfa-btn mfa-btn--primary"
                onClick={handleVerify}
                disabled={loading || code.some((d) => !d)}
              >
                {loading ? 'Verifying...' : 'Verify & Enable'}
              </button>
            </>
          )}
          {step === 'backup' && (
            <>
              <button
                className="mfa-btn mfa-btn--secondary"
                onClick={handleCopyBackupCodes}
              >
                Copy Codes
              </button>
              <button
                className="mfa-btn mfa-btn--primary"
                onClick={() => { onEnabled(); onClose() }}
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}


// ── MFA Verify Dialog (login flow) ────────────────────────
interface MFAVerifyProps {
  onVerified: (accessToken: string, refreshToken: string) => void
  onCancel: () => void
}

export const MFAVerifyDialog: React.FC<MFAVerifyProps> = ({ onVerified, onCancel }) => {
  const { mfaToken } = useAuthStore()
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [useBackup, setUseBackup] = useState(false)
  const [backupCode, setBackupCode] = useState('')
  const digitRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleDigitChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1)
    if (value && !/^\d$/.test(value)) return

    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)
    setError('')

    if (value && index < 5) {
      digitRefs.current[index + 1]?.focus()
    }
  }

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      digitRefs.current[index - 1]?.focus()
    }
  }

  const handleVerify = async () => {
    const token = useBackup ? backupCode.trim() : code.join('')
    if (!useBackup && token.length !== 6) {
      setError('Enter all 6 digits')
      return
    }
    if (useBackup && !token) {
      setError('Enter a backup code')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await centralApi.auth.verifyMFALogin(mfaToken || '', token)
      onVerified(result.accessToken, result.refreshToken)
    } catch (e) {
      setError('Invalid code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mfa-overlay">
      <div className="mfa-dialog">
        <div className="mfa-dialog__header">
          <span className="mfa-dialog__title">
            <KeyIcon size={16} /> Two-Factor Authentication
          </span>
          <button className="mfa-dialog__close" onClick={onCancel}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="mfa-dialog__body">
          <div className="mfa-verify">
            <div className="mfa-verify__icon">
              <ShieldIcon size={36} />
            </div>
            <div className="mfa-verify__title">Verify Your Identity</div>
            <div className="mfa-verify__desc">
              {useBackup
                ? 'Enter one of your backup codes'
                : 'Enter the 6-digit code from your authenticator app'
              }
            </div>

            {useBackup ? (
              <input
                className="mfa-code__digit"
                style={{ width: '100%', fontSize: 14, height: 40 }}
                type="text"
                placeholder="Enter backup code"
                value={backupCode}
                onChange={(e) => { setBackupCode(e.target.value); setError('') }}
                autoFocus
              />
            ) : (
              <div className="mfa-code">
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { digitRefs.current[i] = el }}
                    className="mfa-code__digit"
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    autoFocus={i === 0}
                  />
                ))}
              </div>
            )}

            {error && <div className="mfa-error">{error}</div>}
          </div>
        </div>

        <div className="mfa-dialog__footer">
          <button
            className="mfa-btn mfa-btn--secondary"
            onClick={() => { setUseBackup(!useBackup); setError('') }}
          >
            {useBackup ? 'Use authenticator' : 'Use backup code'}
          </button>
          <button
            className="mfa-btn mfa-btn--primary"
            onClick={handleVerify}
            disabled={loading}
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </div>
      </div>
    </div>
  )
}
