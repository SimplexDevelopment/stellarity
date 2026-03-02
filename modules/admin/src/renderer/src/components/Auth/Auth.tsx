import React, { useState } from 'react'
import { useAdminAuthStore } from '../../stores/adminAuthStore'
import { adminApi } from '../../utils/adminApi'
import { DiamondIcon, LockIcon } from '../Icons'
import './Auth.css'

export const AuthScreen: React.FC = () => {
  const { setAdmin, setTokens, setError, setLoading, setMfaRequired, error, isLoading, mfaRequired, mfaToken } = useAdminAuthStore()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await adminApi.auth.login({ username, password })

      if (result.mfaRequired) {
        setMfaRequired(true, result.mfaToken)
      } else if (result.admin && result.accessToken && result.refreshToken) {
        setTokens(result.accessToken, result.refreshToken)
        setAdmin(result.admin)
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mfaToken) return
    setError(null)
    setLoading(true)

    try {
      const result = await adminApi.auth.verifyMfa(mfaToken, mfaCode)
      setTokens(result.accessToken, result.refreshToken)
      setAdmin(result.admin)
      setMfaRequired(false)
    } catch (err: any) {
      setError(err.message || 'MFA verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen grid-overlay">
      <div className="auth-container">
        <div className="auth-header">
          <DiamondIcon size={48} className="auth-logo" />
          <h1 className="auth-title">COMMAND CENTER</h1>
          <p className="auth-subtitle">ADMINISTRATOR ACCESS REQUIRED</p>
        </div>

        {!mfaRequired ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="auth-field">
              <label className="auth-label">OPERATOR ID</label>
              <input
                type="text"
                className="auth-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">ACCESS CODE</label>
              <input
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="auth-error">
                <span className="auth-error__icon">!</span>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn--primary auth-submit" disabled={isLoading}>
              <LockIcon size={14} />
              {isLoading ? 'AUTHENTICATING...' : 'AUTHENTICATE'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleMfaVerify}>
            <p className="auth-mfa-text">
              Enter the 6-digit code from your authenticator app.
            </p>

            <div className="auth-field">
              <label className="auth-label">MFA CODE</label>
              <input
                type="text"
                className="auth-input auth-input--mfa"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                required
              />
            </div>

            {error && (
              <div className="auth-error">
                <span className="auth-error__icon">!</span>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn--primary auth-submit" disabled={isLoading || mfaCode.length < 6}>
              {isLoading ? 'VERIFYING...' : 'VERIFY'}
            </button>

            <button
              type="button"
              className="btn btn--ghost auth-back"
              onClick={() => {
                setMfaRequired(false)
                setMfaCode('')
                setError(null)
              }}
            >
              Back to Login
            </button>
          </form>
        )}

        <div className="auth-footer">
          <span className="auth-footer__text">STELLARITY — RESTRICTED ACCESS</span>
        </div>
      </div>
    </div>
  )
}
