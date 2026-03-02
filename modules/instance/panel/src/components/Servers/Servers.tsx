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
      </div>

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
