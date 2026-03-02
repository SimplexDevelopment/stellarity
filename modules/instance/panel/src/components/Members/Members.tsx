import React, { useEffect, useState, useCallback } from 'react';
import { panelApi } from '../../utils/panelApi';
import { usePanelUIStore } from '../../stores/panelUIStore';
import './Members.css';

type Filter = 'all' | 'active' | 'banned';

export const Members: React.FC = () => {
  const [members, setMembers] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const viewMember = usePanelUIStore((s) => s.viewMember);
  const showConfirm = usePanelUIStore((s) => s.showConfirmDialog);

  const fetchMembers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const data = await panelApi.members.list({
        page,
        search: search || undefined,
        filter: filter !== 'all' ? filter : undefined,
      });
      setMembers(data.members);
      setPagination(data.pagination);
    } catch { /* handled by API client */ }
    setLoading(false);
  }, [search, filter]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleBan = (member: any) => {
    showConfirm({
      title: 'Ban Member',
      message: `Ban "${member.username}" from this instance? They will be removed from all servers and unable to rejoin.`,
      confirmLabel: 'BAN',
      variant: 'danger',
      onConfirm: async () => {
        await panelApi.members.ban(member.userId, 'Banned by instance admin');
        fetchMembers(pagination.page);
      },
    });
  };

  const handleUnban = (member: any) => {
    showConfirm({
      title: 'Unban Member',
      message: `Unban "${member.username}"? They will be able to rejoin servers on this instance.`,
      confirmLabel: 'UNBAN',
      variant: 'warning',
      onConfirm: async () => {
        await panelApi.members.unban(member.userId);
        fetchMembers(pagination.page);
      },
    });
  };

  const handleRemove = (member: any) => {
    showConfirm({
      title: 'Remove Member',
      message: `Completely remove "${member.username}" and all their data from this instance? This cannot be undone.`,
      confirmLabel: 'REMOVE',
      variant: 'danger',
      onConfirm: async () => {
        await panelApi.members.remove(member.userId);
        fetchMembers(pagination.page);
      },
    });
  };

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'ALL' },
    { key: 'active', label: 'ACTIVE' },
    { key: 'banned', label: 'BANNED' },
  ];

  return (
    <div className="members-view">
      <div className="members-view__toolbar">
        <div className="search-bar">
          <span className="search-bar__icon">⌕</span>
          <input
            type="search"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="members-view__filters">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              className={`btn btn--sm ${filter === key ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><span className="spinner" /> LOADING MEMBERS</div>
      ) : members.length === 0 ? (
        <div className="empty-state">NO MEMBERS FOUND</div>
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Display Name</th>
                <th>Servers</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    <button className="members-view__name-link" onClick={() => viewMember(m.userId)}>
                      {m.username}
                    </button>
                  </td>
                  <td className="text-secondary">{m.displayName || '—'}</td>
                  <td>{m.serverCount || 0}</td>
                  <td>
                    {m.isBanned
                      ? <span className="badge badge--danger">BANNED</span>
                      : <span className="badge badge--success">ACTIVE</span>
                    }
                  </td>
                  <td className="text-muted">{new Date(m.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="members-view__actions">
                      <button className="btn btn--sm btn--ghost" onClick={() => viewMember(m.userId)}>VIEW</button>
                      {m.isBanned ? (
                        <button className="btn btn--sm btn--ghost" onClick={() => handleUnban(m)}>UNBAN</button>
                      ) : (
                        <button className="btn btn--sm btn--danger" onClick={() => handleBan(m)}>BAN</button>
                      )}
                      <button className="btn btn--sm btn--danger" onClick={() => handleRemove(m)}>REMOVE</button>
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
          <button className="btn btn--sm btn--ghost" disabled={pagination.page <= 1} onClick={() => fetchMembers(pagination.page - 1)}>
            PREV
          </button>
          <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
          <button className="btn btn--sm btn--ghost" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchMembers(pagination.page + 1)}>
            NEXT
          </button>
        </div>
      )}
    </div>
  );
};
