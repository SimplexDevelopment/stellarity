import React from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAuthStore } from '../../stores/authStore'
import { useVoiceStore } from '../../stores/voiceStore'
import { useTheme } from '../../hooks/useTheme'
import {
  GearIcon,
  MicIcon,
  HeadphonesIcon,
  PaletteIcon,
  LogOutIcon,
  ChevronIcon,
  CheckIcon,
} from '../Icons'
import './SettingsView.css'

type SettingsSection = 'main' | 'theme' | 'voice'

export const SettingsView: React.FC = () => {
  const { user, clearAuth } = useAuthStore()
  const settings = useSettingsStore()
  const { selfMute, selfDeaf, setSelfMute, setSelfDeaf } = useVoiceStore()
  const [section, setSection] = React.useState<SettingsSection>('main')

  useTheme()

  const themes: { id: typeof settings.theme; label: string; colors: string[] }[] = [
    { id: 'clinical', label: 'Clinical', colors: ['#0a0e1a', '#00e5ff', '#1a1f2e'] },
    { id: 'cyan-navy', label: 'Cyan Navy', colors: ['#0b1622', '#00bcd4', '#162230'] },
    { id: 'violet-nebula', label: 'Violet Nebula', colors: ['#1a0e2e', '#bb86fc', '#2d1b69'] },
    { id: 'multi-zone', label: 'Multi Zone', colors: ['#0d1117', '#58a6ff', '#21262d'] },
  ]

  const handleLogout = () => {
    clearAuth()
  }

  if (section === 'theme') {
    return (
      <div className="m-settings">
        <div className="mobile-header">
          <button className="mobile-header__back" onClick={() => setSection('main')}>
            <ChevronIcon size={16} direction="left" />
          </button>
          <span className="mobile-header__title">THEME</span>
        </div>
        <div className="m-settings__content">
          <div className="m-settings__group">
            {themes.map(t => (
              <button
                key={t.id}
                className={`m-theme-option ${settings.theme === t.id ? 'm-theme-option--active' : ''}`}
                onClick={() => settings.setAppearance({ theme: t.id })}
              >
                <div className="m-theme-option__preview">
                  {t.colors.map((c, i) => (
                    <div key={i} style={{ background: c }} className="m-theme-option__swatch" />
                  ))}
                </div>
                <span className="m-theme-option__label">{t.label}</span>
                {settings.theme === t.id && <CheckIcon size={16} className="m-theme-option__check" />}
              </button>
            ))}
          </div>

          <div className="m-settings__group">
            <div className="m-settings__group-header">Display</div>
            <div className="m-settings__row">
              <span>Compact Mode</span>
              <label className="m-toggle">
                <input
                  type="checkbox"
                  checked={settings.compactMode}
                  onChange={() => settings.setAppearance({ compactMode: !settings.compactMode })}
                />
                <span className="m-toggle__slider" />
              </label>
            </div>
            <div className="m-settings__row">
              <span>Show Avatars</span>
              <label className="m-toggle">
                <input
                  type="checkbox"
                  checked={settings.showAvatars}
                  onChange={() => settings.setAppearance({ showAvatars: !settings.showAvatars })}
                />
                <span className="m-toggle__slider" />
              </label>
            </div>
            <div className="m-settings__row">
              <span>Font Size</span>
              <div className="m-settings__font-picker">
                {(['small', 'medium', 'large'] as const).map(s => (
                  <button
                    key={s}
                    className={`m-settings__font-btn ${settings.fontSize === s ? 'm-settings__font-btn--active' : ''}`}
                    onClick={() => settings.setAppearance({ fontSize: s })}
                  >
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (section === 'voice') {
    return (
      <div className="m-settings">
        <div className="mobile-header">
          <button className="mobile-header__back" onClick={() => setSection('main')}>
            <ChevronIcon size={16} direction="left" />
          </button>
          <span className="mobile-header__title">VOICE</span>
        </div>
        <div className="m-settings__content">
          <div className="m-settings__group">
            <div className="m-settings__group-header">Controls</div>
            <div className="m-settings__row">
              <span><MicIcon size={14} /> Microphone</span>
              <label className="m-toggle">
                <input type="checkbox" checked={!selfMute} onChange={() => setSelfMute(!selfMute)} />
                <span className="m-toggle__slider" />
              </label>
            </div>
            <div className="m-settings__row">
              <span><HeadphonesIcon size={14} /> Audio Output</span>
              <label className="m-toggle">
                <input type="checkbox" checked={!selfDeaf} onChange={() => setSelfDeaf(!selfDeaf)} />
                <span className="m-toggle__slider" />
              </label>
            </div>
          </div>

          <div className="m-settings__group">
            <div className="m-settings__group-header">Processing</div>
            <div className="m-settings__row">
              <span>Noise Suppression</span>
              <label className="m-toggle">
                <input type="checkbox" checked={settings.noiseSuppression} onChange={() => settings.setVoiceSettings({ noiseSuppression: !settings.noiseSuppression })} />
                <span className="m-toggle__slider" />
              </label>
            </div>
            <div className="m-settings__row">
              <span>Echo Cancellation</span>
              <label className="m-toggle">
                <input type="checkbox" checked={settings.echoCancellation} onChange={() => settings.setVoiceSettings({ echoCancellation: !settings.echoCancellation })} />
                <span className="m-toggle__slider" />
              </label>
            </div>
            <div className="m-settings__row">
              <span>Auto Gain</span>
              <label className="m-toggle">
                <input type="checkbox" checked={settings.autoGainControl} onChange={() => settings.setVoiceSettings({ autoGainControl: !settings.autoGainControl })} />
                <span className="m-toggle__slider" />
              </label>
            </div>
          </div>

          <div className="m-settings__group">
            <div className="m-settings__group-header">Input Volume</div>
            <input
              type="range"
              min="0"
              max="200"
              value={settings.inputVolume}
              onChange={(e) => settings.setVoiceSettings({ inputVolume: Number(e.target.value) })}
              className="m-settings__slider"
            />
            <span className="m-settings__slider-label">{settings.inputVolume}%</span>
          </div>
        </div>
      </div>
    )
  }

  // Main settings
  return (
    <div className="m-settings">
      <div className="mobile-header">
        <span className="mobile-header__title">SETTINGS</span>
      </div>
      <div className="m-settings__content">
        {/* User card */}
        <div className="m-settings__user-card">
          <div className="m-settings__user-avatar">
            {(user?.displayName || user?.username || 'U')[0].toUpperCase()}
          </div>
          <div className="m-settings__user-info">
            <span className="m-settings__user-name">{user?.displayName || user?.username}</span>
            <span className="m-settings__user-id">@{user?.username}</span>
          </div>
        </div>

        {/* Navigation items */}
        <div className="m-settings__group">
          <button className="m-settings__nav-item" onClick={() => setSection('theme')}>
            <PaletteIcon size={18} />
            <span>Appearance</span>
            <ChevronIcon size={14} direction="right" className="m-settings__nav-arrow" />
          </button>
          <button className="m-settings__nav-item" onClick={() => setSection('voice')}>
            <MicIcon size={18} />
            <span>Voice & Audio</span>
            <ChevronIcon size={14} direction="right" className="m-settings__nav-arrow" />
          </button>
        </div>

        {/* Logout */}
        <div className="m-settings__group">
          <button className="m-settings__nav-item m-settings__nav-item--danger" onClick={handleLogout}>
            <LogOutIcon size={18} />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>
  )
}
