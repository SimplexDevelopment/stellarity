import React, { useEffect, useState, useCallback } from 'react';
import { panelApi } from '../../utils/panelApi';
import { usePanelUIStore } from '../../stores/panelUIStore';
import './Database.css';

interface TableInfo {
  name: string;
  rowCount: number;
  readOnly: boolean;
}

export const Database: React.FC = () => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const viewTable = usePanelUIStore((s) => s.viewTable);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await panelApi.database.getTables();
      setTables(data.tables);
    } catch (err: any) {
      setError(err.message || 'Failed to load tables');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);

  return (
    <div className="database-view">
      <div className="database-view__summary">
        <div className="stat-card">
          <span className="stat-card__label">TABLES</span>
          <span className="stat-card__value">{tables.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">TOTAL ROWS</span>
          <span className="stat-card__value">{totalRows.toLocaleString()}</span>
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><span className="spinner" /> LOADING TABLES</div>
      ) : error ? (
        <div className="empty-state">{error}</div>
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Table</th>
                <th>Rows</th>
                <th>Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.name}>
                  <td>
                    <button className="database-view__table-link" onClick={() => viewTable(t.name)}>
                      {t.name}
                    </button>
                  </td>
                  <td>{t.rowCount.toLocaleString()}</td>
                  <td>
                    {t.readOnly ? (
                      <span className="badge badge--warning">READ-ONLY</span>
                    ) : (
                      <span className="badge badge--success">READ/WRITE</span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn--sm btn--ghost" onClick={() => viewTable(t.name)}>
                      BROWSE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
