import React, { useEffect, useState } from 'react';
import { usePanelAuthStore } from '../../stores/panelAuthStore';
import { panelApi } from '../../utils/panelApi';
import './Auth.css';

export const Auth: React.FC = () => {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const { isLoading, error, setLoading, setError, setToken } = usePanelAuthStore();

  // Check if this is the first-time setup
  useEffect(() => {
    panelApi.auth.status()
      .then(({ needsSetup: setup }) => setNeedsSetup(setup))
      .catch(() => setNeedsSetup(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim() || isLoading) return;

    setLoading(true);
    setError(null);

    try {
      const { token } = await panelApi.auth.login(passphrase);
      setToken(token);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim() || isLoading) return;

    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters');
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { token } = await panelApi.auth.setup(passphrase);
      setToken(token);
    } catch (err: any) {
      setError(err.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  // Still checking setup status
  if (needsSetup === null) {
    return (
      <div className="auth-screen">
        <div className="grid-overlay" />
        <div className="auth-card">
          <div className="loading-state"><span className="spinner" /> INITIALIZING</div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="grid-overlay" />
      <div className="auth-card">
        <div className="auth-logo">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>

        {needsSetup ? (
          <>
            <h1 className="auth-title">INITIAL SETUP</h1>
            <p className="auth-subtitle">CHOOSE A PASSPHRASE FOR THIS PANEL</p>

            <form onSubmit={handleSetup} className="auth-form">
              <div className="auth-field">
                <label className="auth-label">NEW PASSPHRASE</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
                  disabled={isLoading}
                  className="auth-input"
                />
              </div>

              <div className="auth-field">
                <label className="auth-label">CONFIRM PASSPHRASE</label>
                <input
                  type="password"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  placeholder="Re-enter passphrase"
                  disabled={isLoading}
                  className="auth-input"
                />
              </div>

              {error && (
                <div className="auth-error">
                  <span className="auth-error__icon">!</span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn--primary auth-submit"
                disabled={isLoading || !passphrase.trim() || !confirmPassphrase.trim()}
              >
                {isLoading ? (
                  <><span className="spinner" /> CONFIGURING</>
                ) : (
                  'SET PASSPHRASE'
                )}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="auth-title">INSTANCE PANEL</h1>
            <p className="auth-subtitle">MANAGEMENT ACCESS REQUIRED</p>

            <form onSubmit={handleLogin} className="auth-form">
              <div className="auth-field">
                <label className="auth-label">ACCESS CODE</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter passphrase"
                  autoFocus
                  disabled={isLoading}
                  className="auth-input"
                />
              </div>

              {error && (
                <div className="auth-error">
                  <span className="auth-error__icon">!</span>
                  {error}
                </div>
              )}

              <button type="submit" className="btn btn--primary auth-submit" disabled={isLoading || !passphrase.trim()}>
                {isLoading ? (
                  <><span className="spinner" /> AUTHENTICATING</>
                ) : (
                  'AUTHENTICATE'
                )}
              </button>
            </form>
          </>
        )}

        <p className="auth-footer">STELLARITY — INSTANCE MANAGEMENT</p>
      </div>
    </div>
  );
};
