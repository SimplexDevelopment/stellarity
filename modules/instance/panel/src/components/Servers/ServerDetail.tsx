import React, { useEffect, useState, useCallback } from 'react';
import { panelApi } from '../../utils/panelApi';
import { usePanelUIStore } from '../../stores/panelUIStore';
import './ServerDetail.css';

export const ServerDetail: React.FC = () => {
  const serverId = usePanelUIStore((s) => s.selectedServerId);
  const setActiveView = usePanelUIStore((s) => s.setActiveView);
  const viewMember = usePanelUIStore((s) => s.viewMember);
  const showConfirm = usePanelUIStore((s) => s.showConfirmDialog);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Server editing state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMaxMembers, setEditMaxMembers] = useState(100);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Channel creation state
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChName, setNewChName] = useState('');
  const [newChType, setNewChType] = useState<'text' | 'voice'>('text');
  const [newChDesc, setNewChDesc] = useState('');
  const [newChCatId, setNewChCatId] = useState('');

  // Category creation state
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Role creation state
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('');

  const fetchServer = useCallback(async () => {
    if (!serverId) return;
    setLoading(true);
    try {
      const result = await panelApi.servers.get(serverId);
      setData(result);
    } catch { /* handled */ }
    setLoading(false);
  }, [serverId]);

  useEffect(() => { fetchServer(); }, [fetchServer]);

  if (!serverId) return <div className="empty-state">NO SERVER SELECTED</div>;
  if (loading) return <div className="loading-state"><span className="spinner" /> LOADING SERVER</div>;
  if (!data) return <div className="empty-state">SERVER NOT FOUND</div>;

  const { server, channels, categories: cats, members, roles, recentModeration } = data;
  const categories = cats || [];

  // ── Server Edit ──────────────────────────────────────

  const startEditing = () => {
    setEditName(server.name);
    setEditDescription(server.description || '');
    setEditMaxMembers(server.maxMembers);
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => { setEditing(false); setError(null); };

  const saveEdits = async () => {
    setSaving(true);
    setError(null);
    try {
      await panelApi.servers.update(serverId, { name: editName, description: editDescription, maxMembers: editMaxMembers });
      setEditing(false);
      fetchServer();
    } catch (err: any) { setError(err.message || 'Failed to update server'); }
    setSaving(false);
  };

  const handleRegenerateInvite = () => {
    showConfirm({
      title: 'Regenerate Invite Code',
      message: `This will invalidate the current invite code "${server.inviteCode}". Continue?`,
      confirmLabel: 'REGENERATE',
      variant: 'warning',
      onConfirm: async () => { await panelApi.servers.regenerateInvite(serverId); fetchServer(); },
    });
  };

  const handleTransferOwnership = (member: any) => {
    showConfirm({
      title: 'Transfer Ownership',
      message: `Transfer ownership of "${server.name}" to ${member.username}?`,
      confirmLabel: 'TRANSFER',
      variant: 'warning',
      onConfirm: async () => { await panelApi.servers.transferOwnership(serverId, member.userId); fetchServer(); },
    });
  };

  const handleDeleteServer = () => {
    showConfirm({
      title: 'Delete Server',
      message: `Permanently delete server "${server.name}"? This cannot be undone.`,
      confirmLabel: 'DELETE',
      variant: 'danger',
      onConfirm: async () => { await panelApi.servers.delete(serverId); setActiveView('servers'); },
    });
  };

  // ── Channel CRUD ─────────────────────────────────────

  const handleCreateChannel = async () => {
    if (!newChName.trim()) return;
    try {
      await panelApi.servers.createChannel(serverId, {
        name: newChName.trim(),
        type: newChType,
        description: newChDesc.trim() || undefined,
        categoryId: newChCatId || undefined,
      });
      setShowAddChannel(false);
      setNewChName(''); setNewChDesc(''); setNewChCatId('');
      fetchServer();
    } catch (err: any) { setError(err.message); }
  };

  const handleDeleteChannel = (ch: any) => {
    showConfirm({
      title: 'Delete Channel',
      message: `Delete channel "${ch.name}"? All messages in this channel will be lost.`,
      confirmLabel: 'DELETE',
      variant: 'danger',
      onConfirm: async () => { await panelApi.servers.deleteChannel(serverId, ch.id); fetchServer(); },
    });
  };

  // ── Category CRUD ────────────────────────────────────

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await panelApi.servers.createCategory(serverId, { name: newCatName.trim() });
      setShowAddCategory(false);
      setNewCatName('');
      fetchServer();
    } catch (err: any) { setError(err.message); }
  };

  const handleDeleteCategory = (cat: any) => {
    showConfirm({
      title: 'Delete Category',
      message: `Delete category "${cat.name}"? Channels in it will become uncategorized.`,
      confirmLabel: 'DELETE',
      variant: 'warning',
      onConfirm: async () => { await panelApi.servers.deleteCategory(serverId, cat.id); fetchServer(); },
    });
  };

  // ── Role CRUD ────────────────────────────────────────

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      await panelApi.servers.createRole(serverId, {
        name: newRoleName.trim(),
        color: newRoleColor || undefined,
      });
      setShowAddRole(false);
      setNewRoleName(''); setNewRoleColor('');
      fetchServer();
    } catch (err: any) { setError(err.message); }
  };

  const handleDeleteRole = (role: any) => {
    if (role.name === '@everyone') return;
    showConfirm({
      title: 'Delete Role',
      message: `Delete role "${role.name}"? Members with this role will lose it.`,
      confirmLabel: 'DELETE',
      variant: 'danger',
      onConfirm: async () => { await panelApi.servers.deleteRole(serverId, role.id); fetchServer(); },
    });
  };

  return (
    <div className="server-detail">
      <div className="server-detail__breadcrumb">
        <button className="btn btn--ghost btn--sm" onClick={() => setActiveView('servers')}>
          ← BACK TO SERVERS
        </button>
      </div>

      {/* ── Server Header / Edit Form ──────────────────── */}
      <div className="server-detail__header panel">
        <div className="panel-header">
          <span>{editing ? 'EDIT SERVER' : server.name}</span>
          <div className="server-detail__header-actions">
            {!editing && (
              <>
                <button className="btn btn--sm btn--ghost" onClick={startEditing}>EDIT</button>
                <button className="btn btn--sm btn--danger" onClick={handleDeleteServer}>DELETE</button>
              </>
            )}
          </div>
        </div>

        {error && <div className="server-detail__error">{error}</div>}

        {editing ? (
          <div className="server-detail__edit-form">
            <div className="server-detail__field">
              <label className="server-detail__field-label">Name</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="server-detail__field">
              <label className="server-detail__field-label">Description</label>
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>
            <div className="server-detail__field">
              <label className="server-detail__field-label">Max Members</label>
              <input type="number" value={editMaxMembers} onChange={(e) => setEditMaxMembers(parseInt(e.target.value) || 100)} min={1} />
            </div>
            <div className="server-detail__edit-actions">
              <button className="btn btn--sm btn--ghost" onClick={cancelEditing} disabled={saving}>CANCEL</button>
              <button className="btn btn--sm btn--primary" onClick={saveEdits} disabled={saving}>
                {saving ? 'SAVING…' : 'SAVE'}
              </button>
            </div>
          </div>
        ) : (
          <div className="server-detail__meta">
            <div><span className="text-muted">Owner:</span> {server.ownerUsername || server.ownerId}</div>
            <div className="server-detail__invite-row">
              <span className="text-muted">Invite:</span>
              <code>{server.inviteCode}</code>
              <button className="btn btn--sm btn--ghost" onClick={handleRegenerateInvite}>REGENERATE</button>
            </div>
            <div><span className="text-muted">Created:</span> {new Date(server.createdAt).toLocaleDateString()}</div>
            <div><span className="text-muted">Max Members:</span> {server.maxMembers}</div>
            {server.description && <div><span className="text-muted">Description:</span> {server.description}</div>}
          </div>
        )}
      </div>

      <div className="server-detail__grid">
        {/* ── Channels ──────────────────────────────────── */}
        <div className="panel">
          <div className="panel-header">
            <span>Channels ({channels.length})</span>
            <button className="btn btn--sm btn--ghost" onClick={() => setShowAddChannel(!showAddChannel)}>
              {showAddChannel ? '✕' : '+ ADD'}
            </button>
          </div>

          {showAddChannel && (
            <div className="server-detail__inline-form">
              <input type="text" placeholder="Channel name" value={newChName} onChange={(e) => setNewChName(e.target.value)} />
              <select value={newChType} onChange={(e) => setNewChType(e.target.value as 'text' | 'voice')}>
                <option value="text">Text</option>
                <option value="voice">Voice</option>
              </select>
              <input type="text" placeholder="Description (optional)" value={newChDesc} onChange={(e) => setNewChDesc(e.target.value)} />
              <div className="server-detail__inline-actions">
                <button className="btn btn--sm btn--ghost" onClick={() => setShowAddChannel(false)}>CANCEL</button>
                <button className="btn btn--sm btn--primary" onClick={handleCreateChannel}>CREATE</button>
              </div>
            </div>
          )}

          <div className="server-detail__list">
            {channels.length === 0 ? (
              <div className="server-detail__list-empty">No channels</div>
            ) : channels.map((ch: any) => (
              <div key={ch.id} className="server-detail__list-item">
                <span className="server-detail__channel-icon">{ch.type === 'text' ? '#' : '🔊'}</span>
                <span>{ch.name}</span>
                <span className="badge">{ch.type}</span>
                {ch.description && <span className="text-muted server-detail__ch-desc">{ch.description}</span>}
                <button
                  className="btn btn--sm btn--danger server-detail__item-action"
                  onClick={() => handleDeleteChannel(ch)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Members ───────────────────────────────────── */}
        <div className="panel">
          <div className="panel-header">Members ({members.length})</div>
          <div className="server-detail__list">
            {members.map((m: any) => (
              <div key={m.id} className="server-detail__list-item">
                <button className="servers-view__name-link" onClick={() => viewMember(m.userId)}>
                  {m.username}
                </button>
                {m.nickname && <span className="text-muted">({m.nickname})</span>}
                {m.userId === server.ownerId && <span className="badge">OWNER</span>}
                {m.isBanned && <span className="badge badge--danger">BANNED</span>}
                {m.userId !== server.ownerId && (
                  <button className="btn btn--sm btn--ghost" onClick={() => handleTransferOwnership(m)} style={{ marginLeft: 'auto' }}>
                    MAKE OWNER
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Roles ─────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <span>Roles ({roles.length})</span>
          <button className="btn btn--sm btn--ghost" onClick={() => setShowAddRole(!showAddRole)}>
            {showAddRole ? '✕' : '+ ADD'}
          </button>
        </div>

        {showAddRole && (
          <div className="server-detail__inline-form">
            <input type="text" placeholder="Role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
            <input type="text" placeholder="Color (e.g. #ff5500)" value={newRoleColor} onChange={(e) => setNewRoleColor(e.target.value)} />
            <div className="server-detail__inline-actions">
              <button className="btn btn--sm btn--ghost" onClick={() => setShowAddRole(false)}>CANCEL</button>
              <button className="btn btn--sm btn--primary" onClick={handleCreateRole}>CREATE</button>
            </div>
          </div>
        )}

        <div className="server-detail__list">
          {roles.length === 0 ? (
            <div className="server-detail__list-empty">No roles</div>
          ) : roles.map((r: any) => (
            <div key={r.id} className="server-detail__list-item">
              {r.color && <span className="server-detail__role-color" style={{ background: r.color }} />}
              <span>{r.name}</span>
              <span className="text-muted">(pos: {r.position})</span>
              {r.permissions && Object.keys(r.permissions).length > 0 && (
                <span className="text-muted server-detail__perm-count">
                  {Object.keys(r.permissions).length} perms
                </span>
              )}
              {r.name !== '@everyone' && (
                <button
                  className="btn btn--sm btn--danger server-detail__item-action"
                  onClick={() => handleDeleteRole(r)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Categories ────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <span>Categories</span>
          <button className="btn btn--sm btn--ghost" onClick={() => setShowAddCategory(!showAddCategory)}>
            {showAddCategory ? '✕' : '+ ADD'}
          </button>
        </div>

        {showAddCategory && (
          <div className="server-detail__inline-form">
            <input type="text" placeholder="Category name" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
            <div className="server-detail__inline-actions">
              <button className="btn btn--sm btn--ghost" onClick={() => setShowAddCategory(false)}>CANCEL</button>
              <button className="btn btn--sm btn--primary" onClick={handleCreateCategory}>CREATE</button>
            </div>
          </div>
        )}

        <div className="server-detail__list">
          {categories.length === 0 ? (
            <div className="server-detail__list-empty">No categories — use Database browser for full access</div>
          ) : categories.map((cat: any) => (
            <div key={cat.id} className="server-detail__list-item">
              <span>📁</span>
              <span>{cat.name}</span>
              <span className="text-muted">{cat.id}</span>
              <button
                className="btn btn--sm btn--danger server-detail__item-action"
                onClick={() => handleDeleteCategory(cat)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent Moderation ─────────────────────────── */}
      {recentModeration.length > 0 && (
        <div className="panel">
          <div className="panel-header">Recent Moderation</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>User</th>
                <th>Moderator</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentModeration.map((a: any) => (
                <tr key={a.id}>
                  <td><span className="badge">{a.action.toUpperCase()}</span></td>
                  <td>{a.userId}</td>
                  <td className="text-secondary">{a.moderatorUsername || a.moderatorId}</td>
                  <td className="text-muted">{a.reason || '—'}</td>
                  <td>{a.isActive ? <span className="badge badge--danger">ACTIVE</span> : <span className="badge">EXPIRED</span>}</td>
                  <td className="text-muted">{new Date(a.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
