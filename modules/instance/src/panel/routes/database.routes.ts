/**
 * Panel Database Browser Routes — /panel/api/database
 *
 * Direct table browsing, inline editing, row insertion and deletion
 * for power-user access to the instance SQLite database.
 *
 * Security:
 *   - Table names validated against a known whitelist
 *   - Column names validated against PRAGMA table_info
 *   - audit_logs table is read-only (no insert/update/delete)
 */
import { Router, Response } from 'express';
import { PanelRequest } from '../middleware.js';
import { query, getDb, generateId, now } from '../../database/database.js';
import { logger } from '../../utils/logger.js';

const router = Router();

// Known instance tables — only these are browsable
const ALLOWED_TABLES = [
  'instance_members',
  'servers',
  'server_members',
  'roles',
  'member_roles',
  'categories',
  'channels',
  'messages',
  'message_reactions',
  'threads',
  'thread_messages',
  'scheduled_messages',
  'channel_member_keys',
  'voice_states',
  'moderation_actions',
  'audit_logs',
  'instance_settings',
  'server_creators',
  'server_features',
];

const READ_ONLY_TABLES = ['audit_logs'];

/** Helper: validate table name against whitelist */
function isValidTable(name: string): boolean {
  return ALLOWED_TABLES.includes(name);
}

/** Helper: get column info for a table */
function getTableColumns(tableName: string): Array<{ name: string; type: string; pk: boolean; notnull: boolean; dflt_value: string | null }> {
  const db = getDb();
  const cols = db.query(`PRAGMA table_info("${tableName}")`).all() as any[];
  return cols.map(c => ({
    name: c.name,
    type: c.type,
    pk: c.pk === 1,
    notnull: c.notnull === 1,
    dflt_value: c.dflt_value,
  }));
}

/** Helper: find primary key column(s) for a table */
function getPrimaryKeyColumns(tableName: string): string[] {
  const cols = getTableColumns(tableName);
  return cols.filter(c => c.pk).map(c => c.name);
}

/** Helper: validate that column names exist in a table */
function validateColumns(tableName: string, columnNames: string[]): boolean {
  const validColumns = getTableColumns(tableName).map(c => c.name);
  return columnNames.every(col => validColumns.includes(col));
}

// ── Routes ─────────────────────────────────────────────────────────

/** GET /panel/api/database — list all tables with row counts */
router.get('/', (_req: PanelRequest, res: Response) => {
  try {
    const tables = ALLOWED_TABLES.map(name => {
      try {
        const countResult = query(`SELECT COUNT(*) as count FROM "${name}"`);
        return {
          name,
          rowCount: countResult.rows[0]?.count || 0,
          readOnly: READ_ONLY_TABLES.includes(name),
        };
      } catch {
        return { name, rowCount: 0, readOnly: READ_ONLY_TABLES.includes(name) };
      }
    });

    res.json({ tables });
  } catch (error) {
    logger.error('Failed to list database tables:', error);
    res.status(500).json({ error: 'Failed to list tables' });
  }
});

/** GET /panel/api/database/:table/schema — column info for a table */
router.get('/:table/schema', (req: PanelRequest, res: Response) => {
  try {
    const { table } = req.params;

    if (!isValidTable(table)) {
      res.status(400).json({ error: `Invalid table name: ${table}` });
      return;
    }

    const columns = getTableColumns(table);
    const primaryKeys = columns.filter(c => c.pk).map(c => c.name);

    res.json({
      table,
      columns,
      primaryKeys,
      readOnly: READ_ONLY_TABLES.includes(table),
    });
  } catch (error) {
    logger.error('Failed to get table schema:', error);
    res.status(500).json({ error: 'Failed to get schema' });
  }
});

/** GET /panel/api/database/:table/rows — paginated rows with search/sort */
router.get('/:table/rows', (req: PanelRequest, res: Response) => {
  try {
    const { table } = req.params;

    if (!isValidTable(table)) {
      res.status(400).json({ error: `Invalid table name: ${table}` });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const sortColumn = (req.query.sort as string) || '';
    const sortOrder = ((req.query.order as string) || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const columns = getTableColumns(table);
    const columnNames = columns.map(c => c.name);

    // Build search clause — search across all TEXT/VARCHAR columns
    let whereClause = '';
    const params: any[] = [];

    if (search) {
      const textColumns = columns.filter(c =>
        c.type.toUpperCase().includes('TEXT') ||
        c.type.toUpperCase().includes('VARCHAR') ||
        c.type === '' // SQLite sometimes has empty type
      );
      if (textColumns.length > 0) {
        const conditions = textColumns.map((_, i) => `"${textColumns[i].name}" LIKE $${i + 1}`);
        whereClause = `WHERE ${conditions.join(' OR ')}`;
        textColumns.forEach(() => params.push(`%${search}%`));
      }
    }

    // Validate sort column
    let orderClause = '';
    if (sortColumn && columnNames.includes(sortColumn)) {
      orderClause = `ORDER BY "${sortColumn}" ${sortOrder}`;
    } else {
      // Default: order by first primary key or first column
      const pkCols = getPrimaryKeyColumns(table);
      const defaultSort = pkCols.length > 0 ? pkCols[0] : columnNames[0];
      if (defaultSort) {
        orderClause = `ORDER BY "${defaultSort}" DESC`;
      }
    }

    // Count total
    const countResult = query(`SELECT COUNT(*) as total FROM "${table}" ${whereClause}`, params);
    const total = countResult.rows[0]?.total || 0;

    // Fetch rows
    const rowsResult = query(
      `SELECT * FROM "${table}" ${whereClause} ${orderClause} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      table,
      columns: columnNames,
      rows: rowsResult.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Failed to get table rows:', error);
    res.status(500).json({ error: 'Failed to get rows' });
  }
});

/** POST /panel/api/database/:table/rows — insert a new row */
router.post('/:table/rows', (req: PanelRequest, res: Response) => {
  try {
    const { table } = req.params;

    if (!isValidTable(table)) {
      res.status(400).json({ error: `Invalid table name: ${table}` });
      return;
    }

    if (READ_ONLY_TABLES.includes(table)) {
      res.status(403).json({ error: `Table "${table}" is read-only` });
      return;
    }

    const data = req.body;
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Request body must be a non-empty object' });
      return;
    }

    const columnNames = Object.keys(data);
    if (!validateColumns(table, columnNames)) {
      res.status(400).json({ error: 'One or more column names are invalid' });
      return;
    }

    const placeholders = columnNames.map((_, i) => `$${i + 1}`).join(', ');
    const values = columnNames.map(col => data[col]);

    const result = query(
      `INSERT INTO "${table}" (${columnNames.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    // Audit log
    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.database.insert', table, '', JSON.stringify({ row: data }), now()]
    );

    res.json({ success: true, row: result.rows[0] || data });
  } catch (error: any) {
    logger.error('Failed to insert row:', error);
    res.status(400).json({ error: error?.message || 'Failed to insert row' });
  }
});

/** PUT /panel/api/database/:table/rows/:id — update a row by primary key */
router.put('/:table/rows/:id', (req: PanelRequest, res: Response) => {
  try {
    const { table, id } = req.params;

    if (!isValidTable(table)) {
      res.status(400).json({ error: `Invalid table name: ${table}` });
      return;
    }

    if (READ_ONLY_TABLES.includes(table)) {
      res.status(403).json({ error: `Table "${table}" is read-only` });
      return;
    }

    const data = req.body;
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Request body must be a non-empty object' });
      return;
    }

    const updateColumns = Object.keys(data);
    if (!validateColumns(table, updateColumns)) {
      res.status(400).json({ error: 'One or more column names are invalid' });
      return;
    }

    // Find primary key column
    const pkColumns = getPrimaryKeyColumns(table);
    if (pkColumns.length === 0) {
      res.status(400).json({ error: 'Table has no primary key — cannot update by ID' });
      return;
    }

    // For compound PKs, use the first PK column with the provided :id
    const pkCol = pkColumns[0];

    const setClauses = updateColumns.map((col, i) => `"${col}" = $${i + 1}`).join(', ');
    const values = updateColumns.map(col => data[col]);
    values.push(id);

    const result = query(
      `UPDATE "${table}" SET ${setClauses} WHERE "${pkCol}" = $${values.length} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Row not found' });
      return;
    }

    // Audit log
    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.database.update', table, id, JSON.stringify({ changes: data }), now()]
    );

    res.json({ success: true, row: result.rows[0] || null });
  } catch (error: any) {
    logger.error('Failed to update row:', error);
    res.status(400).json({ error: error?.message || 'Failed to update row' });
  }
});

/** DELETE /panel/api/database/:table/rows/:id — delete a row by primary key */
router.delete('/:table/rows/:id', (req: PanelRequest, res: Response) => {
  try {
    const { table, id } = req.params;

    if (!isValidTable(table)) {
      res.status(400).json({ error: `Invalid table name: ${table}` });
      return;
    }

    if (READ_ONLY_TABLES.includes(table)) {
      res.status(403).json({ error: `Table "${table}" is read-only` });
      return;
    }

    const pkColumns = getPrimaryKeyColumns(table);
    if (pkColumns.length === 0) {
      res.status(400).json({ error: 'Table has no primary key — cannot delete by ID' });
      return;
    }

    const pkCol = pkColumns[0];

    // Fetch row before deleting for audit log
    const existing = query(`SELECT * FROM "${table}" WHERE "${pkCol}" = $1`, [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Row not found' });
      return;
    }

    query(`DELETE FROM "${table}" WHERE "${pkCol}" = $1`, [id]);

    // Audit log
    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.database.delete', table, id, JSON.stringify({ deletedRow: existing.rows[0] }), now()]
    );

    res.json({ success: true, message: 'Row deleted' });
  } catch (error: any) {
    logger.error('Failed to delete row:', error);
    res.status(400).json({ error: error?.message || 'Failed to delete row' });
  }
});

export default router;
