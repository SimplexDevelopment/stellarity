import React, { useEffect, useState, useCallback } from 'react';
import { panelApi } from '../../utils/panelApi';
import { usePanelUIStore } from '../../stores/panelUIStore';
import './Moderation.css';

export const Moderation: React.FC = () => {
  const [actions, setActions] = useState<any[]>([]);
  const [banned, setBanned] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, total: 0, totalPages: 0 });
  const [activeTab, setActiveTab] = useState<'actions' | 'banned'>('actions');
  const [actionFilter, setActionFilter] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const showConfirm = usePanelUIStore((s) => s.showConfirmDialog);
  const viewMember = usePanelUIStore((s) => s.viewMember);

  const fetchActions = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const data = await panelApi.moderation.getActions({
        page,
        action: actionFilter || undefined,
        activeOnly: activeOnly || undefined,
      });
      setActions(data.actions);
      setPagination(data.pagination);
    } catch { /* handled */ }
    setLoading(false);
  }, [actionFilter, activeOnly]);

  const fetchBanned = useCallback(async () => {
    setLoading(true);
    try {
      const data = await panelApi.moderation.getBanned();
      setBanned(data.bans);
    } catch { /* handled */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'actions') fetchActions();
    else fetchBanned();
  }, [activeTab, fetchActions, fetchBanned]);

  const handleRevoke = (action: any) => {
    showConfirm({
      title: 'Revoke Action',
      message: `Revoke this ${action.action} on user? This will mark the moderation action as inactive.`,
      confirmLabel: 'REVOKE',
      variant: 'warning',
      onConfirm: async () => {
        await panelApi.moderation.revokeAction(action.id);
        fetchActions(pagination.page);
      },
    });
  };

  return (
    <div className="moderation-view">
      <div className="moderation-view__tabs">
        <button
          className={`btn btn--sm ${activeTab === 'actions' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => setActiveTab('actions')}
        >
          ACTIONS LOG
        </button>
        <button
          className={`btn btn--sm ${activeTab === 'banned' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => setActiveTab('banned')}
        >
          ACTIVE BANS
        </button>
      </div>

      {activeTab === 'actions' && (
        <>
          <div className="moderation-view__toolbar">
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">All Actions</option>
              <option value="ban">Ban</option>
              <option value="kick">Kick</option>
              <option value="mute">Mute</option>
              <option value="warn">Warn</option>
              <option value="timeout">Timeout</option>
            </select>
            <label className="moderation-view__toggle-label">
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
              <span>Active Only</span>
            </label>
          </div>

          {loading ? (
            <div className="loading-state"><span className="spinner" /> LOADING ACTIONS</div>
          ) : actions.length === 0 ? (
            <div className="empty-state">NO MODERATION ACTIONS FOUND</div>
          ) : (
            <div className="panel">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>User</th>
                    <th>Server</th>
                    <th>Moderator</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.id}>
                      <td><span className="badge">{a.action.toUpperCase()}</span></td>
                      <td>
                        <button className="members-view__name-link" onClick={() => viewMember(a.userId)}>
                          {a.username || a.userId}
                        </button>
                      </td>
                      <td className="text-secondary">{a.serverName || a.serverId || '—'}</td>
                      <td className="text-secondary">{a.moderatorUsername || a.moderatorId}</td>
                      <td className="text-muted moderation-view__reason">{a.reason || '—'}</td>
                      <td>
                        {a.isActive
                          ? <span className="badge badge--danger">ACTIVE</span>
                          : <span className="badge">EXPIRED</span>
                        }
                      </td>
                      <td className="text-muted">{new Date(a.createdAt).toLocaleString()}</td>
                      <td>
                        {a.isActive && (
                          <button className="btn btn--sm btn--ghost" onClick={() => handleRevoke(a)}>
                            REVOKE
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination.totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn--sm btn--ghost" disabled={pagination.page <= 1} onClick={() => fetchActions(pagination.page - 1)}>
                PREV
              </button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button className="btn btn--sm btn--ghost" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchActions(pagination.page + 1)}>
                NEXT
              </button>
            </div>
          )}
        </>
      )}

      {activeTab === 'banned' && (
        loading ? (
          <div className="loading-state"><span className="spinner" /> LOADING BANS</div>
        ) : banned.length === 0 ? (
          <div className="empty-state">NO ACTIVE BANS</div>
        ) : (
          <div className="panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Scope</th>
                  <th>Server</th>
                  <th>Reason</th>
                  <th>Banned By</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {banned.map((b, i) => (
                  <tr key={i}>
                    <td>
                      <button className="members-view__name-link" onClick={() => viewMember(b.userId)}>
                        {b.username || b.userId}
                      </button>
                    </td>
                    <td><span className="badge">{b.scope?.toUpperCase() || 'SERVER'}</span></td>
                    <td className="text-secondary">{b.serverName || b.serverId || '—'}</td>
                    <td className="text-muted moderation-view__reason">{b.reason || '—'}</td>
                    <td className="text-secondary">{b.moderatorUsername || b.moderatorId || '—'}</td>
                    <td className="text-muted">{new Date(b.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
};
