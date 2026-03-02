import React, { useEffect, useState, useCallback, useRef } from 'react';
import { panelApi } from '../../utils/panelApi';
import { usePanelUIStore } from '../../stores/panelUIStore';
import './DatabaseTable.css';

interface ColumnInfo {
  name: string;
  type: string;
  pk: boolean;
  notnull: boolean;
  dflt_value: string | null;
}

interface EditingCell {
  rowIndex: number;
  column: string;
  value: string;
}

export const DatabaseTable: React.FC = () => {
  const tableName = usePanelUIStore((s) => s.selectedTableName);
  const setActiveView = usePanelUIStore((s) => s.setActiveView);
  const showConfirm = usePanelUIStore((s) => s.showConfirmDialog);

  const [schema, setSchema] = useState<{
    columns: ColumnInfo[];
    primaryKeys: string[];
    readOnly: boolean;
  } | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline editing state
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [saving, setSaving] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Add row state
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});
  const [addError, setAddError] = useState<string | null>(null);

  const fetchSchema = useCallback(async () => {
    if (!tableName) return;
    try {
      const data = await panelApi.database.getSchema(tableName);
      setSchema({ columns: data.columns, primaryKeys: data.primaryKeys, readOnly: data.readOnly });
    } catch (err: any) {
      setError(err.message || 'Failed to load schema');
    }
  }, [tableName]);

  const fetchRows = useCallback(async (page = 1) => {
    if (!tableName) return;
    setLoading(true);
    setError(null);
    try {
      const data = await panelApi.database.getRows(tableName, {
        page,
        limit: pagination.limit,
        search: search || undefined,
        sort: sortColumn || undefined,
        order: sortColumn ? sortOrder : undefined,
      });
      setRows(data.rows);
      setColumns(data.columns);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message || 'Failed to load rows');
    }
    setLoading(false);
  }, [tableName, search, sortColumn, sortOrder, pagination.limit]);

  useEffect(() => { fetchSchema(); }, [fetchSchema]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Focus the edit input when it appears
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  if (!tableName) {
    return <div className="empty-state">NO TABLE SELECTED</div>;
  }

  const isReadOnly = schema?.readOnly ?? false;
  const primaryKeys = schema?.primaryKeys ?? [];

  // Get the primary key value for a row
  const getRowId = (row: any): string => {
    if (primaryKeys.length > 0) {
      return String(row[primaryKeys[0]] ?? '');
    }
    return '';
  };

  // ── Inline Edit ──────────────────────────────────────

  const startEditing = (rowIndex: number, column: string, currentValue: any) => {
    if (isReadOnly || primaryKeys.length === 0) return;
    // Don't allow editing primary key columns
    if (primaryKeys.includes(column)) return;
    setEditingCell({ rowIndex, column, value: currentValue == null ? '' : String(currentValue) });
  };

  const cancelEditing = () => {
    setEditingCell(null);
  };

  const saveEdit = async () => {
    if (!editingCell || !tableName) return;
    const row = rows[editingCell.rowIndex];
    if (!row) return;

    const rowId = getRowId(row);
    if (!rowId) return;

    const originalValue = row[editingCell.column];
    const newValue = editingCell.value;

    // No change? Cancel
    if (String(originalValue ?? '') === newValue) {
      cancelEditing();
      return;
    }

    setSaving(true);
    try {
      await panelApi.database.updateRow(tableName, rowId, {
        [editingCell.column]: newValue === '' ? null : newValue,
      });
      // Update local state
      const updatedRows = [...rows];
      updatedRows[editingCell.rowIndex] = {
        ...updatedRows[editingCell.rowIndex],
        [editingCell.column]: newValue === '' ? null : newValue,
      };
      setRows(updatedRows);
      cancelEditing();
    } catch (err: any) {
      setError(err.message || 'Failed to update cell');
    }
    setSaving(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  // ── Add Row ──────────────────────────────────────────

  const openAddRow = () => {
    if (!schema) return;
    const defaults: Record<string, string> = {};
    for (const col of schema.columns) {
      defaults[col.name] = col.dflt_value ?? '';
    }
    setNewRowData(defaults);
    setAddError(null);
    setShowAddRow(true);
  };

  const saveNewRow = async () => {
    if (!tableName) return;
    setAddError(null);

    // Filter out empty optional fields
    const data: Record<string, any> = {};
    for (const [key, value] of Object.entries(newRowData)) {
      if (value !== '') {
        data[key] = value;
      }
    }

    if (Object.keys(data).length === 0) {
      setAddError('At least one field must have a value');
      return;
    }

    try {
      await panelApi.database.insertRow(tableName, data);
      setShowAddRow(false);
      setNewRowData({});
      fetchRows(pagination.page);
    } catch (err: any) {
      setAddError(err.message || 'Failed to insert row');
    }
  };

  // ── Delete Row ───────────────────────────────────────

  const handleDelete = (row: any) => {
    const rowId = getRowId(row);
    if (!rowId || !tableName) return;

    showConfirm({
      title: 'Delete Row',
      message: `Delete row with ${primaryKeys[0]} = "${rowId}" from ${tableName}? This cannot be undone.`,
      confirmLabel: 'DELETE',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await panelApi.database.deleteRow(tableName, rowId);
          fetchRows(pagination.page);
        } catch (err: any) {
          setError(err.message || 'Failed to delete row');
        }
      },
    });
  };

  // ── Sort ─────────────────────────────────────────────

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortColumn(col);
      setSortOrder('ASC');
    }
  };

  const sortIndicator = (col: string) => {
    if (sortColumn !== col) return '';
    return sortOrder === 'ASC' ? ' ▲' : ' ▼';
  };

  // ── Cell Display ─────────────────────────────────────

  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) return '∅';
    if (typeof value === 'object') return JSON.stringify(value);
    const str = String(value);
    if (str.length > 100) return str.slice(0, 100) + '…';
    return str;
  };

  return (
    <div className="db-table-view">
      <div className="db-table-view__toolbar">
        <button className="btn btn--sm btn--ghost" onClick={() => setActiveView('database')}>
          ← BACK TO TABLES
        </button>
        <h3 className="db-table-view__title">{tableName}</h3>
        {isReadOnly && <span className="badge badge--warning">READ-ONLY</span>}
        <span className="db-table-view__count">{pagination.total.toLocaleString()} rows</span>

        <div className="db-table-view__spacer" />

        <div className="search-bar">
          <span className="search-bar__icon">⌕</span>
          <input
            type="search"
            placeholder="Search rows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {!isReadOnly && (
          <button className="btn btn--sm btn--primary" onClick={openAddRow}>
            + ADD ROW
          </button>
        )}
      </div>

      {error && <div className="db-table-view__error">{error}</div>}

      {/* Add Row Form */}
      {showAddRow && schema && (
        <div className="db-table-view__add-row panel">
          <div className="panel-header">
            <h4>INSERT NEW ROW</h4>
            <button className="btn btn--sm btn--ghost" onClick={() => setShowAddRow(false)}>✕</button>
          </div>
          <div className="db-table-view__add-row-fields">
            {schema.columns.map((col) => (
              <div key={col.name} className="db-table-view__field">
                <label className="db-table-view__field-label">
                  {col.name}
                  <span className="db-table-view__field-type">{col.type}</span>
                  {col.notnull && <span className="db-table-view__field-required">*</span>}
                  {col.pk && <span className="badge badge--warning">PK</span>}
                </label>
                <input
                  type="text"
                  value={newRowData[col.name] ?? ''}
                  onChange={(e) => setNewRowData({ ...newRowData, [col.name]: e.target.value })}
                  placeholder={col.dflt_value ? `Default: ${col.dflt_value}` : col.notnull ? 'Required' : 'Optional'}
                />
              </div>
            ))}
          </div>
          {addError && <div className="db-table-view__error">{addError}</div>}
          <div className="db-table-view__add-row-actions">
            <button className="btn btn--sm btn--ghost" onClick={() => setShowAddRow(false)}>CANCEL</button>
            <button className="btn btn--sm btn--primary" onClick={saveNewRow}>INSERT</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state"><span className="spinner" /> LOADING ROWS</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">NO ROWS FOUND</div>
      ) : (
        <div className="panel db-table-view__table-wrapper">
          <div className="db-table-view__scroll">
            <table className="data-table db-table-view__table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="db-table-view__th"
                      onClick={() => handleSort(col)}
                    >
                      {col}{sortIndicator(col)}
                    </th>
                  ))}
                  {!isReadOnly && primaryKeys.length > 0 && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={getRowId(row) || rowIndex}>
                    {columns.map((col) => {
                      const isEditing =
                        editingCell?.rowIndex === rowIndex && editingCell?.column === col;
                      const editable =
                        !isReadOnly && primaryKeys.length > 0 && !primaryKeys.includes(col);

                      return (
                        <td
                          key={col}
                          className={`db-table-view__cell ${editable ? 'db-table-view__cell--editable' : ''} ${row[col] === null ? 'db-table-view__cell--null' : ''}`}
                          onDoubleClick={() => editable && startEditing(rowIndex, col, row[col])}
                        >
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              className="db-table-view__edit-input"
                              value={editingCell.value}
                              onChange={(e) =>
                                setEditingCell({ ...editingCell, value: e.target.value })
                              }
                              onKeyDown={handleEditKeyDown}
                              onBlur={saveEdit}
                              disabled={saving}
                            />
                          ) : (
                            <span className="db-table-view__cell-value">
                              {formatCellValue(row[col])}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {!isReadOnly && primaryKeys.length > 0 && (
                      <td>
                        <button
                          className="btn btn--sm btn--danger"
                          onClick={() => handleDelete(row)}
                        >
                          DELETE
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn btn--sm btn--ghost"
            disabled={pagination.page <= 1}
            onClick={() => fetchRows(pagination.page - 1)}
          >
            PREV
          </button>
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <button
            className="btn btn--sm btn--ghost"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => fetchRows(pagination.page + 1)}
          >
            NEXT
          </button>
        </div>
      )}

      {!isReadOnly && (
        <div className="db-table-view__hint">
          Double-click a cell to edit inline. Press Enter to save, Escape to cancel.
        </div>
      )}
    </div>
  );
};
