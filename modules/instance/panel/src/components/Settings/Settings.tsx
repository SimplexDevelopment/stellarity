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

      <ServerFeatures />

      <RawSettings />

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

/** Server feature config for a single server */
interface ServerFeatureEntry {
  serverId: string;
  serverName: string | null;
  buildALobbyEnabled: boolean;
  buildALobbyPosition: number;
  autoOverflowEnabled: boolean;
  updatedAt: string;
}

/** Server Features sub-component — manage per-server feature toggles */
const ServerFeatures: React.FC = () => {
  const [features, setFeatures] = useState<ServerFeatureEntry[]>([]);
  const [servers, setServers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newServerId, setNewServerId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [featRes, serverRes] = await Promise.all([
        panelApi.settings.getServerFeatures(),
        panelApi.servers.list({ limit: 200 }),
      ]);
      setFeatures(featRes.features);
      setServers(serverRes.servers.map((s: any) => ({ id: s.id, name: s.name })));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (serverId: string, field: string, value: boolean | number) => {
    setSaving(serverId);
    try {
      await panelApi.settings.updateServerFeatures(serverId, { [field]: value });
      setMessage({ type: 'success', text: 'Feature updated' });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(null);
    }
  };

  /** Configure features for a server that doesn't have config yet */
  const handleAddServer = async () => {
    if (!newServerId) return;
    setSaving(newServerId);
    try {
      // Create default features entry via an update (backend upserts)
      await panelApi.settings.updateServerFeatures(newServerId, { buildALobbyEnabled: true });
      setMessage({ type: 'success', text: 'Server features configured' });
      setNewServerId('');
      setShowAdd(false);
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (serverId: string) => {
    setSaving(serverId);
    try {
      await panelApi.settings.resetServerFeatures(serverId);
      setMessage({ type: 'success', text: 'Server features reset to defaults' });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="loading-state"><span className="spinner" /> LOADING</div>;
  }

  // Servers that don't have a features row yet
  const configuredServerIds = new Set(features.map(f => f.serverId));
  const unconfiguredServers = servers.filter(s => !configuredServerIds.has(s.id));

  return (
    <div className="panel">
      <div className="panel-header settings__panel-header">
        Server Features
        {unconfiguredServers.length > 0 && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? '✕ CANCEL' : '+ CONFIGURE SERVER'}
          </button>
        )}
      </div>
      <div className="settings__body">
        <p className="settings__hint">
          Configure per-server feature toggles such as Build-a-Lobby and Auto Overflow channels.
        </p>

        {showAdd && (
          <div className="settings__add-form">
            <div className="settings__field">
              <label className="settings__label">Server</label>
              <select value={newServerId} onChange={e => setNewServerId(e.target.value)}>
                <option value="">Select a server…</option>
                {unconfiguredServers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="settings__actions">
              <button type="button" className="btn btn--primary btn--small" onClick={handleAddServer} disabled={!newServerId || saving !== null}>
                CONFIGURE
              </button>
            </div>
          </div>
        )}

        {features.length === 0 && !showAdd && (
          <div className="settings__hint">No servers have custom feature configuration. Default settings apply.</div>
        )}

        {features.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Server</th>
                <th>Build-a-Lobby</th>
                <th>Lobby Position</th>
                <th>Auto Overflow</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {features.map(f => (
                <tr key={f.serverId}>
                  <td>{f.serverName || f.serverId}</td>
                  <td>
                    <button
                      type="button"
                      className={`settings__toggle ${f.buildALobbyEnabled ? 'settings__toggle--on' : ''}`}
                      onClick={() => handleToggle(f.serverId, 'buildALobbyEnabled', !f.buildALobbyEnabled)}
                      disabled={saving === f.serverId}
                    >
                      <span className="settings__toggle-knob" />
                      <span className="settings__toggle-label">{f.buildALobbyEnabled ? 'ON' : 'OFF'}</span>
                    </button>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={f.buildALobbyPosition}
                      onChange={e => handleToggle(f.serverId, 'buildALobbyPosition', parseInt(e.target.value, 10) || 0)}
                      disabled={saving === f.serverId}
                      style={{ width: '60px' }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`settings__toggle ${f.autoOverflowEnabled ? 'settings__toggle--on' : ''}`}
                      onClick={() => handleToggle(f.serverId, 'autoOverflowEnabled', !f.autoOverflowEnabled)}
                      disabled={saving === f.serverId}
                    >
                      <span className="settings__toggle-knob" />
                      <span className="settings__toggle-label">{f.autoOverflowEnabled ? 'ON' : 'OFF'}</span>
                    </button>
                  </td>
                  <td>
                    <button type="button" className="btn btn--danger btn--small" onClick={() => handleReset(f.serverId)} disabled={saving === f.serverId}>
                      RESET
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

/** Raw Settings sub-component — view/edit all key-value instance settings */
const RawSettings: React.FC = () => {
  const [rawSettings, setRawSettings] = useState<Array<{ key: string; value: string; updatedAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await panelApi.settings.getRawSettings();
      setRawSettings(res.settings);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (key: string, value: string) => {
    try {
      await panelApi.settings.upsertRawSetting(key, value);
      setMessage({ type: 'success', text: `Setting "${key}" updated` });
      setEditingKey(null);
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleAdd = async () => {
    if (!newKey) return;
    try {
      await panelApi.settings.upsertRawSetting(newKey, newValue);
      setMessage({ type: 'success', text: `Setting "${newKey}" created` });
      setNewKey('');
      setNewValue('');
      setShowAdd(false);
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete setting "${key}"?`)) return;
    try {
      await panelApi.settings.deleteRawSetting(key);
      setMessage({ type: 'success', text: `Setting "${key}" deleted` });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  if (loading) {
    return <div className="loading-state"><span className="spinner" /> LOADING</div>;
  }

  return (
    <div className="panel">
      <div className="panel-header settings__panel-header">
        Raw Instance Settings
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? '✕ CANCEL' : '+ ADD SETTING'}
        </button>
      </div>
      <div className="settings__body">
        <p className="settings__hint">
          Direct access to all key-value instance settings stored in the database.
          Use caution — these values drive instance behavior.
        </p>

        {showAdd && (
          <div className="settings__add-form">
            <div className="settings__row">
              <div className="settings__field">
                <label className="settings__label">Key</label>
                <input type="text" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="setting_key" />
              </div>
              <div className="settings__field">
                <label className="settings__label">Value</label>
                <input type="text" value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="value" />
              </div>
            </div>
            <div className="settings__actions">
              <button type="button" className="btn btn--primary btn--small" onClick={handleAdd} disabled={!newKey}>
                ADD SETTING
              </button>
            </div>
          </div>
        )}

        {rawSettings.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rawSettings.map(s => (
                <tr key={s.key}>
                  <td><code>{s.key}</code></td>
                  <td>
                    {editingKey === s.key ? (
                      <div className="settings__inline-edit">
                        <input
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSave(s.key, editValue);
                            if (e.key === 'Escape') setEditingKey(null);
                          }}
                          autoFocus
                        />
                        <button type="button" className="btn btn--primary btn--small" onClick={() => handleSave(s.key, editValue)}>
                          SAVE
                        </button>
                      </div>
                    ) : (
                      <span
                        className="settings__raw-value"
                        onDoubleClick={() => { setEditingKey(s.key); setEditValue(s.value); }}
                        title="Double-click to edit"
                      >
                        {s.value || <span className="text-muted">(empty)</span>}
                      </span>
                    )}
                  </td>
                  <td className="text-muted">{s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '—'}</td>
                  <td>
                    <button type="button" className="btn btn--danger btn--small" onClick={() => handleDelete(s.key)}>
                      DELETE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="settings__hint">No settings stored yet.</div>
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
