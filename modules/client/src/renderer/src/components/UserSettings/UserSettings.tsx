import React, { useState } from 'react';
import { useSettingsStore, ProfileStyle } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { voiceManager } from '../../utils/voiceManager';
import { MFASetupDialog } from '../MFA/MFA';
import {
  CloseIcon, MicIcon, WaveformIcon, BellIcon,
  ShieldIcon, KeyIcon, UsersIcon, InfoIcon, EyeIcon,
} from '../Icons';
import './UserSettings.css';

type SettingsTab = 'profile' | 'voice' | 'appearance' | 'notifications' | 'privacy' | 'keybinds';

const TAB_CONFIG: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <UsersIcon size={16} /> },
  { id: 'voice', label: 'Voice & Audio', icon: <WaveformIcon size={16} /> },
  { id: 'appearance', label: 'Appearance', icon: <EyeIcon size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <BellIcon size={16} /> },
  { id: 'privacy', label: 'Privacy', icon: <ShieldIcon size={16} /> },
  { id: 'keybinds', label: 'Keybinds', icon: <KeyIcon size={16} /> },
];

export const UserSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const { user } = useAuthStore();

  const tabLabel = TAB_CONFIG.find(t => t.id === activeTab)?.label ?? activeTab;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings panel" onClick={(e) => e.stopPropagation()}>
        <aside className="settings__sidebar">
          <div className="settings__user">
            <div className="settings__avatar">
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="settings__user-info">
              <span className="settings__username">{user?.username}</span>
              <span className="settings__user-id">#{user?.id?.slice(0, 8)}</span>
            </div>
          </div>

          <nav className="settings__nav">
            <span className="settings__nav-header">SYSTEM CONFIG</span>
            {TAB_CONFIG.map(tab => (
              <button
                key={tab.id}
                className={`settings__nav-item${activeTab === tab.id ? ' settings__nav-item--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="settings__content">
          <div className="settings__header panel-header">
            <h2>{tabLabel}</h2>
            <button className="btn-icon" onClick={onClose} title="Close">
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="settings__body">
            {activeTab === 'profile' && <ProfileSettings />}
            {activeTab === 'voice' && <VoiceSettings />}
            {activeTab === 'appearance' && <AppearanceSettings />}
            {activeTab === 'notifications' && <NotificationSettings />}
            {activeTab === 'privacy' && <PrivacySettings />}
            {activeTab === 'keybinds' && <KeybindSettings />}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ───────── Profile ───────── */
const ProfileSettings: React.FC = () => {
  const {
    profileStyle, displayName, bio, accentColor,
    title, company, status, customStatus,
    setProfileStyle, setDisplayName, setBio, setAccentColor,
    setProfessionalProfile, setCasualProfile,
  } = useSettingsStore();

  return (
    <div className="stg-section">
      {/* Profile style */}
      <div className="stg-group">
        <h3 className="stg-group__title">Profile Style</h3>
        <p className="stg-group__desc">Choose how your profile appears to others</p>
        <div className="stg-cards stg-cards--2col">
          <button
            className={`stg-card${profileStyle === 'professional' ? ' stg-card--active' : ''}`}
            onClick={() => setProfileStyle('professional')}
          >
            <ShieldIcon size={28} />
            <div className="stg-card__text">
              <span className="stg-card__name">Professional</span>
              <span className="stg-card__desc">Business-focused with title &amp; company</span>
            </div>
          </button>

          <button
            className={`stg-card${profileStyle === 'casual' ? ' stg-card--active' : ''}`}
            onClick={() => setProfileStyle('casual')}
          >
            <UsersIcon size={28} />
            <div className="stg-card__text">
              <span className="stg-card__name">Casual</span>
              <span className="stg-card__desc">Relaxed with custom status</span>
            </div>
          </button>
        </div>
      </div>

      {/* Basic info */}
      <div className="stg-group">
        <h3 className="stg-group__title">Basic Info</h3>

        <label className="stg-field">
          <span className="stg-field__label">Display Name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
          />
        </label>

        <label className="stg-field">
          <span className="stg-field__label">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself..."
            rows={3}
          />
        </label>

        <label className="stg-field">
          <span className="stg-field__label">Accent Color</span>
          <div className="stg-color-picker">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
            />
            <span className="stg-color-picker__hex">{accentColor}</span>
          </div>
        </label>
      </div>

      {/* Professional details */}
      {profileStyle === 'professional' && (
        <div className="stg-group">
          <h3 className="stg-group__title">Professional Details</h3>

          <label className="stg-field">
            <span className="stg-field__label">Job Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setProfessionalProfile({ title: e.target.value })}
              placeholder="Software Engineer"
            />
          </label>

          <label className="stg-field">
            <span className="stg-field__label">Company</span>
            <input
              type="text"
              value={company}
              onChange={(e) => setProfessionalProfile({ company: e.target.value })}
              placeholder="Stellar Industries"
            />
          </label>
        </div>
      )}

      {/* Casual details */}
      {profileStyle === 'casual' && (
        <div className="stg-group">
          <h3 className="stg-group__title">Status</h3>

          <label className="stg-field">
            <span className="stg-field__label">Status</span>
            <select
              value={status}
              onChange={(e) => setCasualProfile({ status: e.target.value })}
            >
              <option value="online">Online</option>
              <option value="idle">Idle</option>
              <option value="dnd">Do Not Disturb</option>
              <option value="invisible">Invisible</option>
            </select>
          </label>

          <label className="stg-field">
            <span className="stg-field__label">Custom Status</span>
            <input
              type="text"
              value={customStatus}
              onChange={(e) => setCasualProfile({ customStatus: e.target.value })}
              placeholder="What are you up to?"
            />
          </label>
        </div>
      )}
    </div>
  );
};

/* ───────── Voice ───────── */
const VoiceSettings: React.FC = () => {
  const {
    inputDevice, outputDevice, inputVolume, outputVolume,
    bitrate, voiceActivityThreshold, pushToTalk, pushToTalkKey,
    noiseSuppression, echoCancellation, autoGainControl,
    setVoiceSettings,
  } = useSettingsStore();

  const [devices, setDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({
    inputs: [], outputs: [],
  });
  const [micLevel, setMicLevel] = useState(0);
  const [testingMic, setTestingMic] = useState(false);
  const testStreamRef = React.useRef<MediaStream | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const animationRef = React.useRef<number | null>(null);

  const loadDevices = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        inputs: list.filter(d => d.kind === 'audioinput'),
        outputs: list.filter(d => d.kind === 'audiooutput'),
      });
    } catch (e) { console.error('Failed to load devices:', e); }
  }, []);

  React.useEffect(() => {
    loadDevices();
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
      stopMicTest();
    };
  }, [loadDevices]);

  const startMicTest = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: inputDevice ? { deviceId: { exact: inputDevice } } : true,
      };
      testStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(testStreamRef.current);
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      src.connect(analyserRef.current);
      setTestingMic(true);
      const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b) / buf.length;
        setMicLevel(Math.min(100, avg * 1.5));
        animationRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { console.error('Failed to start mic test:', e); }
  };

  const stopMicTest = () => {
    testStreamRef.current?.getTracks().forEach(t => t.stop());
    testStreamRef.current = null;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    analyserRef.current = null;
    setTestingMic(false);
    setMicLevel(0);
  };

  const { currentChannelId } = useVoiceStore();

  const handleInputChange = async (deviceId: string | null) => {
    setVoiceSettings({ inputDevice: deviceId });
    if (currentChannelId && deviceId) {
      try { await voiceManager.setInputDevice(deviceId); } catch (e) { console.error(e); }
    }
    if (testingMic) { stopMicTest(); setTimeout(startMicTest, 100); }
  };

  const handleOutputChange = async (deviceId: string | null) => {
    setVoiceSettings({ outputDevice: deviceId });
    if (currentChannelId && deviceId) {
      try { await voiceManager.setOutputDevice(deviceId); } catch (e) { console.error(e); }
    }
  };

  return (
    <div className="stg-section">
      {/* Input */}
      <div className="stg-group">
        <h3 className="stg-group__title">Input Device</h3>
        <select value={inputDevice || ''} onChange={(e) => handleInputChange(e.target.value || null)}>
          <option value="">Default</option>
          {devices.inputs.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>

        <div className="stg-mic-test">
          <button
            className={`stg-mic-test__btn${testingMic ? ' stg-mic-test__btn--active' : ''}`}
            onClick={testingMic ? stopMicTest : startMicTest}
          >
            <MicIcon size={14} />
            {testingMic ? 'Stop' : 'Test'}
          </button>
          <div className="stg-mic-test__bar">
            <div className="stg-mic-test__level" style={{ width: `${micLevel}%` }} />
            <div className="stg-mic-test__threshold" style={{ left: `${voiceActivityThreshold}%` }} />
          </div>
        </div>

        <label className="stg-field">
          <span className="stg-field__label">Input Volume: {inputVolume}%</span>
          <input type="range" min="0" max="200" value={inputVolume}
            onChange={(e) => setVoiceSettings({ inputVolume: parseInt(e.target.value) })} />
        </label>
      </div>

      {/* Output */}
      <div className="stg-group">
        <h3 className="stg-group__title">Output Device</h3>
        <select value={outputDevice || ''} onChange={(e) => handleOutputChange(e.target.value || null)}>
          <option value="">Default</option>
          {devices.outputs.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
        <label className="stg-field">
          <span className="stg-field__label">Output Volume: {outputVolume}%</span>
          <input type="range" min="0" max="200" value={outputVolume}
            onChange={(e) => setVoiceSettings({ outputVolume: parseInt(e.target.value) })} />
        </label>
      </div>

      {/* Quality */}
      <div className="stg-group">
        <h3 className="stg-group__title">Voice Quality</h3>
        <label className="stg-field">
          <span className="stg-field__label">Bitrate: {bitrate} kbps</span>
          <input type="range" min="32" max="256" step="8" value={bitrate}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              setVoiceSettings({ bitrate: v });
              if (currentChannelId) voiceManager.setBitrate(v);
            }} />
          <span className="stg-field__hint">Higher = better quality, more bandwidth (32-256 kbps)</span>
        </label>
      </div>

      {/* Detection */}
      <div className="stg-group">
        <h3 className="stg-group__title">Voice Detection</h3>
        <label className="stg-toggle">
          <span>Push to Talk</span>
          <input type="checkbox" checked={pushToTalk}
            onChange={(e) => setVoiceSettings({ pushToTalk: e.target.checked })} />
        </label>
        {pushToTalk && (
          <label className="stg-field">
            <span className="stg-field__label">Push to Talk Key</span>
            <input type="text" value={pushToTalkKey} readOnly placeholder="Press a key..."
              onKeyDown={(e) => { e.preventDefault(); setVoiceSettings({ pushToTalkKey: e.key }); }} />
          </label>
        )}
        {!pushToTalk && (
          <label className="stg-field">
            <span className="stg-field__label">Voice Activity Threshold: {voiceActivityThreshold}%</span>
            <input type="range" min="0" max="100" value={voiceActivityThreshold}
              onChange={(e) => setVoiceSettings({ voiceActivityThreshold: parseInt(e.target.value) })} />
          </label>
        )}
      </div>

      {/* Processing */}
      <div className="stg-group">
        <h3 className="stg-group__title">Audio Processing</h3>
        <label className="stg-toggle">
          <span>Noise Suppression</span>
          <input type="checkbox" checked={noiseSuppression}
            onChange={(e) => setVoiceSettings({ noiseSuppression: e.target.checked })} />
        </label>
        <label className="stg-toggle">
          <span>Echo Cancellation</span>
          <input type="checkbox" checked={echoCancellation}
            onChange={(e) => setVoiceSettings({ echoCancellation: e.target.checked })} />
        </label>
        <label className="stg-toggle">
          <span>Auto Gain Control</span>
          <input type="checkbox" checked={autoGainControl}
            onChange={(e) => setVoiceSettings({ autoGainControl: e.target.checked })} />
        </label>
      </div>
    </div>
  );
};

/* ───────── Appearance ───────── */
const AppearanceSettings: React.FC = () => {
  const { theme, compactMode, fontSize, showAvatars, animateEmoji, setAppearance } = useSettingsStore();

  const themes = [
    { id: 'clinical',       name: 'Clinical',       desc: 'Clean bright interface',     swatch: ['#e8ecf1','#0a84ff','#0f1923'] },
    { id: 'cyan-navy',      name: 'Cyan Navy',      desc: 'Deep space blues',           swatch: ['#0b1929','#00d4ff','#112240'] },
    { id: 'violet-nebula',  name: 'Violet Nebula',  desc: 'Cosmic purple tones',        swatch: ['#1a0d2e','#a855f7','#2d1b4e'] },
    { id: 'multi-zone',     name: 'Multi-Zone',     desc: 'Functional multi-color',     swatch: ['#111317','#00d4aa','#22d3ee'] },
  ] as const;

  return (
    <div className="stg-section">
      <div className="stg-group">
        <h3 className="stg-group__title">Theme</h3>
        <div className="stg-cards stg-cards--2col">
          {themes.map(t => (
            <button
              key={t.id}
              className={`stg-card stg-card--theme${theme === t.id ? ' stg-card--active' : ''}`}
              onClick={() => setAppearance({ theme: t.id })}
            >
              <div className="stg-card__swatch">
                {t.swatch.map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </div>
              <div className="stg-card__text">
                <span className="stg-card__name">{t.name}</span>
                <span className="stg-card__desc">{t.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="stg-group">
        <h3 className="stg-group__title">Text Size</h3>
        <div className="stg-sizes">
          {(['small', 'medium', 'large'] as const).map(size => (
            <button
              key={size}
              className={`stg-size${fontSize === size ? ' stg-size--active' : ''}`}
              onClick={() => setAppearance({ fontSize: size })}
            >
              <span style={{ fontSize: size === 'small' ? '12px' : size === 'medium' ? '14px' : '16px' }}>Aa</span>
              <span>{size.charAt(0).toUpperCase() + size.slice(1)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="stg-group">
        <h3 className="stg-group__title">Display Options</h3>
        <label className="stg-toggle"><span>Compact Mode</span>
          <input type="checkbox" checked={compactMode} onChange={(e) => setAppearance({ compactMode: e.target.checked })} />
        </label>
        <label className="stg-toggle"><span>Show Avatars</span>
          <input type="checkbox" checked={showAvatars} onChange={(e) => setAppearance({ showAvatars: e.target.checked })} />
        </label>
        <label className="stg-toggle"><span>Animate Emoji</span>
          <input type="checkbox" checked={animateEmoji} onChange={(e) => setAppearance({ animateEmoji: e.target.checked })} />
        </label>
      </div>
    </div>
  );
};

/* ───────── Notifications ───────── */
const NotificationSettings: React.FC = () => {
  const { enableNotifications, notificationSound, notificationVolume, setNotificationSettings } = useSettingsStore();
  return (
    <div className="stg-section">
      <div className="stg-group">
        <h3 className="stg-group__title">Notifications</h3>
        <label className="stg-toggle"><span>Enable Notifications</span>
          <input type="checkbox" checked={enableNotifications} onChange={(e) => setNotificationSettings({ enableNotifications: e.target.checked })} />
        </label>
        <label className="stg-toggle"><span>Notification Sound</span>
          <input type="checkbox" checked={notificationSound} onChange={(e) => setNotificationSettings({ notificationSound: e.target.checked })} />
        </label>
        {notificationSound && (
          <label className="stg-field">
            <span className="stg-field__label">Notification Volume: {notificationVolume}%</span>
            <input type="range" min="0" max="100" value={notificationVolume}
              onChange={(e) => setNotificationSettings({ notificationVolume: parseInt(e.target.value) })} />
          </label>
        )}
      </div>
    </div>
  );
};

/* ───────── Privacy ───────── */
const PrivacySettings: React.FC = () => {
  const { showOnlineStatus, allowDirectMessages, allowFriendRequests, setPrivacy } = useSettingsStore();
  const { user } = useAuthStore();
  const [showMFASetup, setShowMFASetup] = useState(false);

  return (
    <div className="stg-section">
      <div className="stg-group">
        <h3 className="stg-group__title">Privacy</h3>
        <label className="stg-toggle"><span>Show Online Status</span>
          <input type="checkbox" checked={showOnlineStatus} onChange={(e) => setPrivacy({ showOnlineStatus: e.target.checked })} />
        </label>
        <label className="stg-toggle"><span>Allow Direct Messages</span>
          <input type="checkbox" checked={allowDirectMessages} onChange={(e) => setPrivacy({ allowDirectMessages: e.target.checked })} />
        </label>
        <label className="stg-toggle"><span>Allow Friend Requests</span>
          <input type="checkbox" checked={allowFriendRequests} onChange={(e) => setPrivacy({ allowFriendRequests: e.target.checked })} />
        </label>
      </div>

      <div className="stg-group">
        <h3 className="stg-group__title">Two-Factor Authentication</h3>
        <p className="stg-group__desc">
          {user?.mfaEnabled
            ? 'MFA is enabled. Your account requires a verification code at login.'
            : 'Add an extra layer of security with a TOTP authenticator app.'}
        </p>
        <button
          className={`btn ${user?.mfaEnabled ? 'btn--danger' : 'btn--primary'}`}
          onClick={() => setShowMFASetup(true)}
        >
          <ShieldIcon size={14} />
          {user?.mfaEnabled ? 'Manage MFA' : 'Enable MFA'}
        </button>
      </div>

      <MFASetupDialog
        isOpen={showMFASetup}
        onClose={() => setShowMFASetup(false)}
        onEnabled={() => {
          setShowMFASetup(false);
          // Refresh user data to reflect mfaEnabled state
          const store = useAuthStore.getState();
          if (store.user) {
            store.setUser({ ...store.user, mfaEnabled: true });
          }
        }}
      />
    </div>
  );
};

/* ───────── Keybinds ───────── */
const KeybindSettings: React.FC = () => {
  const { keybinds, setKeybind } = useSettingsStore();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  const defs = [
    { action: 'pushToTalk', label: 'Push to Talk', desc: 'Hold to transmit voice' },
    { action: 'toggleMute', label: 'Toggle Mute', desc: 'Mute/unmute microphone' },
    { action: 'toggleDeafen', label: 'Toggle Deafen', desc: 'Deafen/undeafen audio' },
    { action: 'disconnect', label: 'Disconnect', desc: 'Leave voice channel' },
    { action: 'openSettings', label: 'Open Settings', desc: 'Open settings panel' },
  ];

  const formatKey = (key: string): string => {
    if (!key) return 'Not set';
    return key.split('+').map(p => {
      const l = p.toLowerCase();
      if (l === 'ctrl') return 'Ctrl';
      if (l === 'shift') return 'Shift';
      if (l === 'alt') return 'Alt';
      if (l === 'space') return 'Space';
      if (l === 'escape') return 'Esc';
      if (l === 'backspace') return 'Backspace';
      if (l === 'enter') return 'Enter';
      if (l === 'tab') return 'Tab';
      if (p.length === 1) return p.toUpperCase();
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join(' + ');
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: string) => {
    if (editingKey !== action) return;
    e.preventDefault();
    e.stopPropagation();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      setPressedKeys(prev => new Set([...prev, e.key.toLowerCase()]));
      return;
    }
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    let keyName = e.key;
    if (e.code.startsWith('Key')) keyName = e.code.replace('Key', '').toLowerCase();
    else if (e.code.startsWith('Digit')) keyName = e.code.replace('Digit', '');
    else if (e.key === ' ') keyName = 'Space';
    parts.push(keyName);
    setKeybind(action, parts.join('+'));
    setEditingKey(null);
    setPressedKeys(new Set());
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    setPressedKeys(prev => { const n = new Set(prev); n.delete(e.key.toLowerCase()); return n; });
  };

  return (
    <div className="stg-section">
      <div className="stg-group">
        <h3 className="stg-group__title">Keybinds</h3>
        <p className="stg-group__desc">Click a keybind to change it. Press Escape to cancel.</p>

        <div className="stg-keybinds">
          {defs.map(({ action, label, desc }) => (
            <div key={action} className="stg-keybind">
              <div className="stg-keybind__info">
                <span className="stg-keybind__label">{label}</span>
                <span className="stg-keybind__desc">{desc}</span>
              </div>
              <button
                className={`stg-keybind__value${editingKey === action ? ' stg-keybind__value--editing' : ''}`}
                onClick={() => setEditingKey(action)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setEditingKey(null); return; } handleKeyDown(e, action); }}
                onKeyUp={handleKeyUp}
                onBlur={() => { setEditingKey(null); setPressedKeys(new Set()); }}
              >
                {editingKey === action ? 'Press keys...' : formatKey(keybinds[action])}
              </button>
            </div>
          ))}
        </div>

        <div className="stg-hint">
          <InfoIcon size={14} />
          <span>You can use modifier combinations like Ctrl+Shift+M</span>
        </div>
      </div>
    </div>
  );
};
