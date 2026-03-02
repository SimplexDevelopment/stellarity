import React, { useEffect, useState, useCallback } from 'react';
import { panelApi } from '../../utils/panelApi';
import './AuditLogs.css';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, total: 0, totalPages: 0 });
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const data = await panelApi.auditLogs.list({
        page,
        action: actionFilter || undefined,
      });
      setLogs(data.logs);
      setPagination(data.pagination);
      if (data.actionTypes) setActionTypes(data.actionTypes);
    } catch { /* handled */ }
    setLoading(false);
  }, [actionFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const formatDetails = (details: any) => {
    if (!details) return '—';
    if (typeof details === 'string') return details;
    return JSON.stringify(details, null, 0).slice(0, 120);
  };

  return (
    <div className="audit-view">
      <div className="audit-view__toolbar">
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          <option value="">All Actions</option>
          {actionTypes.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-state"><span className="spinner" /> LOADING AUDIT LOGS</div>
      ) : logs.length === 0 ? (
        <div className="empty-state">NO AUDIT ENTRIES FOUND</div>
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="text-muted audit-view__ts">{new Date(log.createdAt).toLocaleString()}</td>
                  <td><span className="badge">{log.action.replace(/_/g, ' ').toUpperCase()}</span></td>
                  <td className="text-secondary">{log.actorName || log.userId || 'system'}</td>
                  <td className="text-secondary">{log.targetType ? `${log.targetType}: ${log.targetId || ''}` : '—'}</td>
                  <td className="text-muted audit-view__details">{formatDetails(log.details)}</td>
                  <td className="text-muted">{log.ipAddress || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn--sm btn--ghost" disabled={pagination.page <= 1} onClick={() => fetchLogs(pagination.page - 1)}>
            PREV
          </button>
          <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
          <button className="btn btn--sm btn--ghost" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchLogs(pagination.page + 1)}>
            NEXT
          </button>
        </div>
      )}
    </div>
  );
};
