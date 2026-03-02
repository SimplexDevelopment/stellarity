import React, { useEffect, useState, useCallback } from 'react';
import { panelApi } from '../../utils/panelApi';
import { usePanelUIStore } from '../../stores/panelUIStore';
import './Servers.css';

export const Servers: React.FC = () => {
  const [servers, setServers] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const viewServer = usePanelUIStore((s) => s.viewServer);
  const showConfirm = usePanelUIStore((s) => s.showConfirmDialog);

  // Create server state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createOwnerId, setCreateOwnerId] = useState('');
  const [createMaxMembers, setCreateMaxMembers] = useState(100);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchServers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const data = await panelApi.servers.list({ page, search: search || undefined });
      setServers(data.servers);
      setPagination(data.pagination);
    } catch { /* handled by API client */ }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchServers(); }, [fetchServers]);

  const handleDelete = (server: any) => {
    showConfirm({
      title: 'Delete Server',
      message: `Are you sure you want to permanently delete "${server.name}"? This will remove all channels, messages, members, and roles. This action cannot be undone.`,
      confirmLabel: 'DELETE',
      variant: 'danger',
      onConfirm: async () => {
        await panelApi.servers.delete(server.id);
        fetchServers(pagination.page);
      },
    });
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (!createName.trim()) { setCreateError('Server name is required'); return; }
    if (!createOwnerId.trim()) { setCreateError('Owner user ID is required'); return; }

    setCreating(true);
    try {
      const result = await panelApi.servers.create({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        ownerId: createOwnerId.trim(),
        maxMembers: createMaxMembers,
      });
      setShowCreate(false);
      setCreateName('');
      setCreateDescription('');
      setCreateOwnerId('');
      setCreateMaxMembers(100);
      fetchServers(1);
      // Navigate to the newly created server
      viewServer(result.serverId);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create server');
    }
    setCreating(false);
  };

  return (
    <div className="servers-view">
      <div className="servers-view__toolbar">
        <div className="search-bar">
          <span className="search-bar__icon">⌕</span>
          <input
            type="search"
            placeholder="Search servers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn--sm btn--primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'CANCEL' : '+ CREATE SERVER'}
        </button>
      </div>

      {/* Create Server Form */}
      {showCreate && (
        <div className="servers-view__create panel">
          <div className="panel-header">CREATE NEW SERVER</div>
          <div className="servers-view__create-fields">
            <div className="servers-view__field">
              <label className="servers-view__field-label">Name *</label>
              <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Server name" />
            </div>
            <div className="servers-view__field">
              <label className="servers-view__field-label">Owner User ID *</label>
              <input type="text" value={createOwnerId} onChange={(e) => setCreateOwnerId(e.target.value)} placeholder="User ID of the server owner" />
            </div>
            <div className="servers-view__field">
              <label className="servers-view__field-label">Description</label>
              <input type="text" value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="servers-view__field">
              <label className="servers-view__field-label">Max Members</label>
              <input type="number" value={createMaxMembers} onChange={(e) => setCreateMaxMembers(parseInt(e.target.value) || 100)} min={1} />
            </div>
          </div>
          {createError && <div className="servers-view__error">{createError}</div>}
          <div className="servers-view__create-actions">
            <button className="btn btn--sm btn--ghost" onClick={() => setShowCreate(false)}>CANCEL</button>
            <button className="btn btn--sm btn--primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'CREATING…' : 'CREATE'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state"><span className="spinner" /> LOADING SERVERS</div>
      ) : servers.length === 0 ? (
        <div className="empty-state">NO SERVERS FOUND</div>
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Owner</th>
                <th>Members</th>
                <th>Channels</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button className="servers-view__name-link" onClick={() => viewServer(s.id)}>
                      {s.name}
                    </button>
                  </td>
                  <td className="text-secondary">{s.ownerUsername || s.ownerId}</td>
                  <td>{s.memberCount}</td>
                  <td>
                    <span className="text-secondary">{s.textChannelCount}T</span>
                    {' / '}
                    <span className="text-secondary">{s.voiceChannelCount}V</span>
                  </td>
                  <td className="text-muted">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="servers-view__actions">
                      <button className="btn btn--sm btn--ghost" onClick={() => viewServer(s.id)}>VIEW</button>
                      <button className="btn btn--sm btn--danger" onClick={() => handleDelete(s)}>DELETE</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn--sm btn--ghost" disabled={pagination.page <= 1} onClick={() => fetchServers(pagination.page - 1)}>
            PREV
          </button>
          <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
          <button className="btn btn--sm btn--ghost" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchServers(pagination.page + 1)}>
            NEXT
          </button>
        </div>
      )}
    </div>
  );
};
