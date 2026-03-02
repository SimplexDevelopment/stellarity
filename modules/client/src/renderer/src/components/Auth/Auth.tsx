import React, { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { centralApi } from '../../utils/centralApi'
import { DiamondIcon, LockIcon, KeyIcon } from '../Icons'
import './Auth.css'

/* ── LoginForm ────────────────────────────────────────── */
export const LoginForm: React.FC<{ onSwitch: () => void }> = ({ onSwitch }) => {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setUser, setTokens, setMfaRequired } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await centralApi.auth.login({ login, password })
      
      if (response.mfaRequired) {
        setMfaRequired(true, response.mfaToken)
        return
      }
      
      if (response.user && response.accessToken && response.refreshToken) {
        setUser(response.user)
        setTokens(response.accessToken, response.refreshToken)
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="auth-form panel" onSubmit={handleSubmit}>
      <div className="auth-form__header">
        <LockIcon size={16} className="auth-form__header-icon" />
        <h2>AUTHENTICATION REQUIRED</h2>
        <p>Enter credentials to access the network</p>
      </div>

      {error && <div className="auth-form__error">{error}</div>}

      <div className="auth-field">
        <label className="auth-field__label">IDENTIFIER</label>
        <input
          type="text"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="Username or email"
          required
          autoFocus
        />
      </div>

      <div className="auth-field">
        <label className="auth-field__label">ACCESS CODE</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          required
        />
      </div>

      <button type="submit" className="btn btn--primary auth-form__submit" disabled={loading}>
        {loading ? (
          <DiamondIcon size={14} className="auth-form__spinner" />
        ) : (
          <>
            <KeyIcon size={14} />
            INITIALIZE CONNECTION
          </>
        )}
      </button>

      <div className="auth-form__footer">
        <span>New to the network?</span>
        <button type="button" className="auth-form__link" onClick={onSwitch}>
          Register identity
        </button>
      </div>
    </form>
  )
}

/* ── RegisterForm ─────────────────────────────────────── */
export const RegisterForm: React.FC<{ onSwitch: () => void }> = ({ onSwitch }) => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setUser, setTokens } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError('Access codes do not match'); return }
    setLoading(true)
    try {
      const response = await centralApi.auth.register({ username, email, password })
      setUser(response.user)
      setTokens(response.accessToken, response.refreshToken)
    } catch (err: any) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="auth-form panel" onSubmit={handleSubmit}>
      <div className="auth-form__header">
        <DiamondIcon size={16} className="auth-form__header-icon" />
        <h2>NEW IDENTITY REGISTRATION</h2>
        <p>Create your network credentials</p>
      </div>

      {error && <div className="auth-form__error">{error}</div>}

      <div className="auth-field">
        <label className="auth-field__label">CALLSIGN</label>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
          placeholder="Unique identifier" required autoFocus pattern="^[a-zA-Z0-9_]+$" minLength={3} maxLength={32} />
      </div>

      <div className="auth-field">
        <label className="auth-field__label">COMM FREQUENCY</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com" required />
      </div>

      <div className="auth-field">
        <label className="auth-field__label">ACCESS CODE</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Min 8 characters" required minLength={8} />
      </div>

      <div className="auth-field">
        <label className="auth-field__label">CONFIRM ACCESS CODE</label>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter password" required />
      </div>

      <button type="submit" className="btn btn--primary auth-form__submit" disabled={loading}>
        {loading ? (
          <DiamondIcon size={14} className="auth-form__spinner" />
        ) : (
          <>
            <DiamondIcon size={14} />
            REGISTER IDENTITY
          </>
        )}
      </button>

      <div className="auth-form__footer">
        <span>Already registered?</span>
        <button type="button" className="auth-form__link" onClick={onSwitch}>
          Access existing identity
        </button>
      </div>
    </form>
  )
}

/* ── AuthScreen ───────────────────────────────────────── */
export const AuthScreen: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true)

  return (
    <div className="auth-screen starfield">
      <div className="auth-screen__grid grid-overlay" />

      <div className="auth-screen__container">
        <div className="auth-screen__logo">
          <div className="auth-screen__logo-hex">
            <DiamondIcon size={28} />
          </div>
          <h1>STELLARITY</h1>
          <p className="auth-screen__version">v1.0</p>
          <p className="auth-screen__author">Simplex Interstellar</p>
        </div>

        {isLogin ? (
          <LoginForm onSwitch={() => setIsLogin(false)} />
        ) : (
          <RegisterForm onSwitch={() => setIsLogin(true)} />
        )}

        <div className="auth-screen__footer">
          ENCRYPTED CONNECTION &bull; AES-256-GCM
        </div>
      </div>
    </div>
  )
}
