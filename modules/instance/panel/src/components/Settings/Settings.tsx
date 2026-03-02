import React, { useEffect, useState, useCallback } from 'react';
import { panelApi } from '../../utils/panelApi';
import { usePanelAuthStore } from '../../stores/panelAuthStore';
import './Settings.css';

interface InstanceSettings {
  name: string;
  description: string | null;
  region: string | null;
  tags: string[];
  isPublic: boolean;
  maxMembers: number;
  iconUrl: string | null;
  serverCreationPolicy: 'everyone' | 'selected';
}

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<InstanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tagsInput, setTagsInput] = useState('');

  const fetchSettings = useCallback(async () => {
    try {
      const { settings: s } = await panelApi.settings.get();
      setSettings(s);
      setTagsInput((s.tags || []).join(', '));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || saving) return;

    setSaving(true);
    setMessage(null);

    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      const { settings: updated, changes } = await panelApi.settings.update({
        ...settings,
        tags,
      });
      setSettings(updated);
      setMessage({ type: 'success', text: `Settings updated: ${changes.join(', ')}` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading-state"><span className="spinner" /> LOADING SETTINGS</div>;
  }

  if (!settings) {
    return <div className="empty-state">FAILED TO LOAD SETTINGS</div>;
  }

  return (
    <div className="settings">
      <form onSubmit={handleSave} className="settings__form">
        <div className="panel">
          <div className="panel-header">Instance Configuration</div>
          <div className="settings__body">
            <div className="settings__field">
              <label className="settings__label">Instance Name</label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
              />
            </div>

            <div className="settings__field">
              <label className="settings__label">Description</label>
              <textarea
                value={settings.description || ''}
                onChange={(e) => setSettings({ ...settings, description: e.target.value || null })}
                rows={3}
              />
            </div>

            <div className="settings__row">
              <div className="settings__field">
                <label className="settings__label">Region</label>
                <input
                  type="text"
                  value={settings.region || ''}
                  onChange={(e) => setSettings({ ...settings, region: e.target.value || null })}
                  placeholder="e.g. us-east, eu-west"
                />
              </div>

              <div className="settings__field">
                <label className="settings__label">Max Members</label>
                <input
                  type="number"
                  value={settings.maxMembers}
                  onChange={(e) => setSettings({ ...settings, maxMembers: parseInt(e.target.value) || 500 })}
                  min={1}
                />
              </div>
            </div>

            <div className="settings__field">
              <label className="settings__label">Tags (comma-separated)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="gaming, community, tech"
              />
            </div>

            <div className="settings__field">
              <label className="settings__label">Icon URL</label>
              <input
                type="text"
                value={settings.iconUrl || ''}
                onChange={(e) => setSettings({ ...settings, iconUrl: e.target.value || null })}
                placeholder="https://..."
              />
            </div>

            <div className="settings__field settings__toggle-field">
              <label className="settings__label">Public Instance</label>
              <button
                type="button"
                className={`settings__toggle ${settings.isPublic ? 'settings__toggle--on' : ''}`}
                onClick={() => setSettings({ ...settings, isPublic: !settings.isPublic })}
              >
                <span className="settings__toggle-knob" />
                <span className="settings__toggle-label">{settings.isPublic ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            <div className="settings__field">
              <label className="settings__label">Server Creation Policy</label>
              <div className="settings__radio-group">
                <label className="settings__radio">
                  <input
                    type="radio"
                    name="serverCreationPolicy"
                    value="everyone"
                    checked={settings.serverCreationPolicy === 'everyone'}
                    onChange={() => setSettings({ ...settings, serverCreationPolicy: 'everyone' })}
                  />
                  <span>Anyone can create servers</span>
                </label>
                <label className="settings__radio">
                  <input
                    type="radio"
                    name="serverCreationPolicy"
                    value="selected"
                    checked={settings.serverCreationPolicy === 'selected'}
                    onChange={() => setSettings({ ...settings, serverCreationPolicy: 'selected' })}
                  />
                  <span>Only selected members</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div className={`settings__message settings__message--${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="settings__actions">
          <button type="button" className="btn btn--ghost" onClick={fetchSettings} disabled={saving}>
            RESET
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? <><span className="spinner" /> SAVING</> : 'SAVE CHANGES'}
          </button>
        </div>
      </form>

      {settings.serverCreationPolicy === 'selected' && <ServerCreators />}

      <ChangePassphrase />
    </div>
  );
};

/** Change Passphrase sub-component */
const ChangePassphrase: React.FC = () => {
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const setToken = usePanelAuthStore((s) => s.setToken);

  const handleChangePassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setMessage(null);

    if (newPassphrase.length < 8) {
      setMessage({ type: 'error', text: 'New passphrase must be at least 8 characters' });
      return;
    }

    if (newPassphrase !== confirmPassphrase) {
      setMessage({ type: 'error', text: 'New passphrases do not match' });
      return;
    }

    setSaving(true);
    try {
      const { token } = await panelApi.auth.changePassphrase(currentPassphrase, newPassphrase);
      setToken(token);
      setCurrentPassphrase('');
      setNewPassphrase('');
      setConfirmPassphrase('');
      setMessage({ type: 'success', text: 'Passphrase changed successfully' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to change passphrase' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleChangePassphrase} className="settings__form">
      <div className="panel">
        <div className="panel-header">Change Passphrase</div>
        <div className="settings__body">
          <div className="settings__field">
            <label className="settings__label">Current Passphrase</label>
            <input
              type="password"
              value={currentPassphrase}
              onChange={(e) => setCurrentPassphrase(e.target.value)}
              placeholder="Enter current passphrase"
            />
          </div>

          <div className="settings__field">
            <label className="settings__label">New Passphrase</label>
            <input
              type="password"
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          <div className="settings__field">
            <label className="settings__label">Confirm New Passphrase</label>
            <input
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              placeholder="Re-enter new passphrase"
            />
          </div>
        </div>
      </div>

      {message && (
        <div className={`settings__message settings__message--${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="settings__actions">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={saving || !currentPassphrase || !newPassphrase || !confirmPassphrase}
        >
          {saving ? <><span className="spinner" /> CHANGING</> : 'CHANGE PASSPHRASE'}
        </button>
      </div>
    </form>
  );
};

/** Server Creators sub-component — manage who can create servers */
const ServerCreators: React.FC = () => {
  const [creators, setCreators] = useState<Array<{ user_id: string; username: string; display_name: string | null; added_at: string }>>([]);
  const [members, setMembers] = useState<Array<{ userId: string; username: string; displayName: string | null }>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [creatorsRes, membersRes] = await Promise.all([
        panelApi.settings.getServerCreators(),
        panelApi.members.list({ limit: 500 }),
      ]);
      setCreators(creatorsRes.creators);
      setMembers(membersRes.members.map((m: any) => ({
        userId: m.user_id || m.userId || m.id,
        username: m.username,
        displayName: m.display_name || m.displayName || null,
      })));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = async (userId: string) => {
    try {
      await panelApi.settings.addServerCreator(userId);
      setMessage({ type: 'success', text: 'Server creator added' });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await panelApi.settings.removeServerCreator(userId);
      setMessage({ type: 'success', text: 'Server creator removed' });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const creatorIds = new Set(creators.map(c => c.user_id));
  const availableMembers = members
    .filter(m => !creatorIds.has(m.userId))
    .filter(m => !search || m.username.toLowerCase().includes(search.toLowerCase()) || m.displayName?.toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return <div className="loading-state"><span className="spinner" /> LOADING</div>;
  }

  return (
    <div className="panel">
      <div className="panel-header">Server Creators</div>
      <div className="settings__body">
        <p className="settings__hint">
          These members are allowed to create servers when the policy is set to "selected members".
        </p>

        {creators.length > 0 && (
          <div className="settings__creators-list">
            {creators.map(c => (
              <div key={c.user_id} className="settings__creator-card">
                <span className="settings__creator-name">{c.display_name || c.username}</span>
                <span className="settings__creator-username">@{c.username}</span>
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  onClick={() => handleRemove(c.user_id)}
                >
                  REMOVE
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="settings__field">
          <label className="settings__label">Add Member</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search members..."
          />
        </div>

        {search && availableMembers.length > 0 && (
          <div className="settings__creators-list">
            {availableMembers.slice(0, 10).map(m => (
              <div key={m.userId} className="settings__creator-card settings__creator-card--add">
                <span className="settings__creator-name">{m.displayName || m.username}</span>
                <span className="settings__creator-username">@{m.username}</span>
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  onClick={() => handleAdd(m.userId)}
                >
                  ADD
                </button>
              </div>
            ))}
          </div>
        )}

        {message && (
          <div className={`settings__message settings__message--${message.type}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
};
