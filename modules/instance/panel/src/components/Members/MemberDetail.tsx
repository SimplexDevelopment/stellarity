import React, { useEffect, useState, useCallback } from 'react';
import { panelApi } from '../../utils/panelApi';
import { usePanelUIStore } from '../../stores/panelUIStore';
import './MemberDetail.css';

export const MemberDetail: React.FC = () => {
  const memberId = usePanelUIStore((s) => s.selectedMemberId);
  const setActiveView = usePanelUIStore((s) => s.setActiveView);
  const viewServer = usePanelUIStore((s) => s.viewServer);
  const showConfirm = usePanelUIStore((s) => s.showConfirmDialog);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const fetchMember = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    try {
      const result = await panelApi.members.get(memberId);
      setData(result);
      setNotes(result.member.adminNotes || '');
    } catch { /* handled */ }
    setLoading(false);
  }, [memberId]);

  useEffect(() => { fetchMember(); }, [fetchMember]);

  const handleSaveNotes = async () => {
    if (!memberId || savingNotes) return;
    setSavingNotes(true);
    try {
      await panelApi.members.setNotes(memberId, notes);
    } catch { /* handled */ }
    setSavingNotes(false);
  };

  const handleBan = () => {
    if (!data) return;
    showConfirm({
      title: 'Ban Member',
      message: `Ban "${data.member.username}" from this instance?`,
      confirmLabel: 'BAN',
      variant: 'danger',
      onConfirm: async () => {
        await panelApi.members.ban(memberId!, 'Banned by instance admin');
        fetchMember();
      },
    });
  };

  const handleUnban = () => {
    if (!data) return;
    showConfirm({
      title: 'Unban Member',
      message: `Unban "${data.member.username}"?`,
      confirmLabel: 'UNBAN',
      variant: 'warning',
      onConfirm: async () => {
        await panelApi.members.unban(memberId!);
        fetchMember();
      },
    });
  };

  if (!memberId) return <div className="empty-state">NO MEMBER SELECTED</div>;
  if (loading) return <div className="loading-state"><span className="spinner" /> LOADING MEMBER</div>;
  if (!data) return <div className="empty-state">MEMBER NOT FOUND</div>;

  const { member, servers, moderationHistory, roles } = data;

  return (
    <div className="member-detail">
      <div className="member-detail__breadcrumb">
        <button className="btn btn--ghost btn--sm" onClick={() => setActiveView('members')}>
          ← BACK TO MEMBERS
        </button>
      </div>

      <div className="panel">
        <div className="panel-header">
          {member.username}
          {member.isBanned && <span className="badge badge--danger" style={{ marginLeft: 'var(--space-3)' }}>BANNED</span>}
        </div>
        <div className="member-detail__info">
          <div><span className="text-muted">User ID:</span> <code>{member.userId}</code></div>
          <div><span className="text-muted">Display Name:</span> {member.displayName || '—'}</div>
          <div><span className="text-muted">Registered:</span> {new Date(member.createdAt).toLocaleString()}</div>
          <div>
            <span className="text-muted">Status:</span>{' '}
            {member.isBanned
              ? <span className="badge badge--danger">BANNED</span>
              : <span className="badge badge--success">ACTIVE</span>
            }
          </div>
          <div className="member-detail__actions">
            {member.isBanned ? (
              <button className="btn btn--sm btn--ghost" onClick={handleUnban}>UNBAN</button>
            ) : (
              <button className="btn btn--sm btn--danger" onClick={handleBan}>BAN</button>
            )}
          </div>
        </div>
      </div>

      <div className="member-detail__grid">
        <div className="panel">
          <div className="panel-header">Server Memberships ({servers.length})</div>
          <div className="member-detail__list">
            {servers.length === 0 ? (
              <div className="empty-state">Not a member of any servers</div>
            ) : servers.map((s: any) => (
              <div key={s.id} className="member-detail__list-item">
                <button className="members-view__name-link" onClick={() => viewServer(s.serverId || s.id)}>
                  {s.serverName || s.name}
                </button>
                {s.isOwner && <span className="badge">OWNER</span>}
                <span className="text-muted" style={{ marginLeft: 'auto' }}>
                  Joined {new Date(s.joinedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Roles ({roles.length})</div>
          <div className="member-detail__list">
            {roles.length === 0 ? (
              <div className="empty-state">No roles assigned</div>
            ) : roles.map((r: any, i: number) => (
              <div key={i} className="member-detail__list-item">
                {r.color && <span className="server-detail__role-color" style={{ background: r.color }} />}
                <span>{r.roleName || r.name}</span>
                <span className="text-muted">in {r.serverName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {moderationHistory.length > 0 && (
        <div className="panel">
          <div className="panel-header">Moderation History</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Server</th>
                <th>Moderator</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {moderationHistory.map((a: any) => (
                <tr key={a.id}>
                  <td><span className="badge">{a.action.toUpperCase()}</span></td>
                  <td className="text-secondary">{a.serverName || a.serverId}</td>
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

      <div className="panel">
        <div className="panel-header">Admin Notes</div>
        <div className="member-detail__notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Private notes visible only to instance admins..."
          />
          <button className="btn btn--sm btn--primary" onClick={handleSaveNotes} disabled={savingNotes}>
            {savingNotes ? 'SAVING...' : 'SAVE NOTES'}
          </button>
        </div>
      </div>
    </div>
  );
};
