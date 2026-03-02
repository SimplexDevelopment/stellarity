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

  const { server, channels, members, roles, recentModeration } = data;

  const handleTransferOwnership = (member: any) => {
    showConfirm({
      title: 'Transfer Ownership',
      message: `Transfer ownership of "${server.name}" to ${member.username}?`,
      confirmLabel: 'TRANSFER',
      variant: 'warning',
      onConfirm: async () => {
        await panelApi.servers.transferOwnership(serverId, member.userId);
        fetchServer();
      },
    });
  };

  return (
    <div className="server-detail">
      <div className="server-detail__breadcrumb">
        <button className="btn btn--ghost btn--sm" onClick={() => setActiveView('servers')}>
          ← BACK TO SERVERS
        </button>
      </div>

      <div className="server-detail__header panel">
        <div className="panel-header">{server.name}</div>
        <div className="server-detail__meta">
          <div><span className="text-muted">Owner:</span> {server.ownerUsername || server.ownerId}</div>
          <div><span className="text-muted">Invite:</span> <code>{server.inviteCode}</code></div>
          <div><span className="text-muted">Created:</span> {new Date(server.createdAt).toLocaleDateString()}</div>
          <div><span className="text-muted">Max Members:</span> {server.maxMembers}</div>
          {server.description && <div><span className="text-muted">Description:</span> {server.description}</div>}
        </div>
      </div>

      <div className="server-detail__grid">
        <div className="panel">
          <div className="panel-header">Channels ({channels.length})</div>
          <div className="server-detail__list">
            {channels.map((ch: any) => (
              <div key={ch.id} className="server-detail__list-item">
                <span className="server-detail__channel-icon">{ch.type === 'text' ? '#' : '🔊'}</span>
                <span>{ch.name}</span>
                <span className="badge">{ch.type}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Members ({members.length})</div>
          <div className="server-detail__list">
            {members.map((m: any) => (
              <div key={m.id} className="server-detail__list-item">
                <button className="servers-view__name-link" onClick={() => viewMember(m.userId)}>
                  {m.username}
                </button>
                {m.userId === server.ownerId && <span className="badge">OWNER</span>}
                {m.isBanned && <span className="badge badge--danger">BANNED</span>}
                {m.userId !== server.ownerId && (
                  <button
                    className="btn btn--sm btn--ghost"
                    onClick={() => handleTransferOwnership(m)}
                    style={{ marginLeft: 'auto' }}
                  >
                    MAKE OWNER
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {roles.length > 0 && (
        <div className="panel">
          <div className="panel-header">Roles ({roles.length})</div>
          <div className="server-detail__list">
            {roles.map((r: any) => (
              <div key={r.id} className="server-detail__list-item">
                {r.color && <span className="server-detail__role-color" style={{ background: r.color }} />}
                <span>{r.name}</span>
                <span className="text-muted">(pos: {r.position})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentModeration.length > 0 && (
        <div className="panel">
          <div className="panel-header">Recent Moderation</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>User</th>
                <th>Moderator</th>
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
