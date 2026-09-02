const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireCapability }        = require('../services/entitlements');

const ALLOWED_STATUSES = ['draft', 'active', 'on_hold', 'completed', 'cancelled'];
const BILLING_MODELS   = ['fixed', 'time_materials', 'cost_plus'];

// Translate DB errors to user-friendly messages — never expose raw SQL
function woDbError(err) {
  const msg = err.message || '';
  if (msg.includes('not-null constraint')) return 'A required field is missing. Please fill in all required fields and try again.';
  if (msg.includes('foreign key constraint')) return 'One or more selected values no longer exist. Please refresh and try again.';
  if (msg.includes('unique constraint') || msg.includes('duplicate key')) return 'A work order with this information already exists.';
  return 'An unexpected error occurred. Please try again.';
}

// Inline capability guard so each route stays readable
const cap = async (req, res, next) => {
  try {
    await requireCapability(req.accountId, 'can_create_projects');
    next();
  } catch (err) {
    res.status(err.statusCode || 403).json({ error: err.message, code: err.code });
  }
};

// ── Numbering helpers ─────────────────────────────────────
async function nextProjectNumber(client, accountId) {
  const { rows } = await client.query(`
    INSERT INTO project_number_sequences (account_id, last_number)
    VALUES ($1, 1)
    ON CONFLICT (account_id) DO UPDATE
      SET last_number = project_number_sequences.last_number + 1
    RETURNING last_number
  `, [accountId]);
  return rows[0].last_number;
}

async function nextWorkOrderNumber(client, projectId) {
  const { rows } = await client.query(`
    INSERT INTO work_order_number_sequences (project_id, last_number)
    VALUES ($1, 1)
    ON CONFLICT (project_id) DO UPDATE
      SET last_number = work_order_number_sequences.last_number + 1
    RETURNING last_number
  `, [projectId]);
  return rows[0].last_number;
}

async function logActivity(client, { accountId, projectId, userId, type, body, metadata }) {
  await client.query(`
    INSERT INTO project_activity (account_id, project_id, user_id, type, body, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [accountId, projectId, userId || null, type, body,
      metadata ? JSON.stringify(metadata) : null]);
}

// ── GET /api/projects ─────────────────────────────────────
router.get('/', requireAuth, requireRole('owner', 'manager', 'staff'), cap, async (req, res) => {
  const { status, search, page = 1, limit = 50 } = req.query;
  const values = [req.accountId];
  let where = 'WHERE p.account_id = $1';

  if (status && ALLOWED_STATUSES.includes(status)) {
    values.push(status);
    where += ` AND p.status = $${values.length}`;
  }
  if (search?.trim()) {
    values.push(`%${search.trim()}%`);
    const n = values.length;
    where += ` AND (p.name ILIKE $${n} OR c.name ILIKE $${n})`;
  }

  try {
    const { rows } = await pool.query(`
      SELECT p.*,
             c.name   AS client_name,
             u.name   AS manager_name,
             COALESCE(wo.cnt, 0)::int AS work_order_count,
             COALESCE(wo.completed_cnt, 0)::int AS completed_work_orders
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN users   u ON u.id = p.manager_id
      LEFT JOIN (
        SELECT project_id,
               COUNT(*) AS cnt,
               COUNT(CASE WHEN status = 'complete' THEN 1 END) AS completed_cnt
        FROM jobs
        WHERE project_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY project_id
      ) wo ON wo.project_id = p.id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `, [...values, parseInt(limit) || 50, ((parseInt(page) || 1) - 1) * (parseInt(limit) || 50)]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/projects ────────────────────────────────────
router.post('/', requireAuth, requireRole('owner', 'manager'), cap, async (req, res) => {
  const {
    name, description, client_id, status = 'active',
    start_date, end_date, manager_id, contract_value = 0,
    billing_model = 'fixed',
    service_address, service_city, service_state, service_zip, location_id,
  } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required.' });
  if (!ALLOWED_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  if (!BILLING_MODELS.includes(billing_model)) return res.status(400).json({ error: 'Invalid billing model.' });

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const num = await nextProjectNumber(db, req.accountId);

    const { rows } = await db.query(`
      INSERT INTO projects (
        account_id, name, description, client_id, status,
        start_date, end_date, manager_id, contract_value, billing_model,
        service_address, service_city, service_state, service_zip, location_id,
        project_number, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      req.accountId, name.trim(), description || null, client_id || null, status,
      start_date || null, end_date || null, manager_id || null,
      parseInt(contract_value) || 0, billing_model,
      service_address || null, service_city || null, service_state || null,
      service_zip || null, location_id || null, num, req.userId,
    ]);

    await logActivity(db, {
      accountId: req.accountId, projectId: rows[0].id, userId: req.userId,
      type: 'created',
      body: `Project PRJ-${String(num).padStart(4, '0')} created.`,
    });

    await db.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    db.release();
  }
});

// ── GET /api/projects/:id ─────────────────────────────────
router.get('/:id', requireAuth, requireRole('owner', 'manager', 'staff'), cap, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*,
             c.name   AS client_name,
             c.email  AS client_email,
             c.phone  AS client_phone,
             u.name   AS manager_name,
             cb.name  AS created_by_name,
             COALESCE(wo.cnt, 0)::int AS work_order_count,
             COALESCE(wo.completed_cnt, 0)::int AS completed_work_orders
      FROM projects p
      LEFT JOIN clients c  ON c.id  = p.client_id
      LEFT JOIN users   u  ON u.id  = p.manager_id
      LEFT JOIN users   cb ON cb.id = p.created_by
      LEFT JOIN (
        SELECT project_id,
               COUNT(*) AS cnt,
               COUNT(CASE WHEN status = 'complete' THEN 1 END) AS completed_cnt
        FROM jobs WHERE project_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY project_id
      ) wo ON wo.project_id = p.id
      WHERE p.id = $1 AND p.account_id = $2
    `, [req.params.id, req.accountId]);

    if (!rows.length) return res.status(404).json({ error: 'Project not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/projects/:id ───────────────────────────────
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), cap, async (req, res) => {
  const FIELDS = [
    'name', 'description', 'client_id', 'status', 'start_date', 'end_date',
    'manager_id', 'contract_value', 'billing_model',
    'service_address', 'service_city', 'service_state', 'service_zip', 'location_id',
  ];
  const updates = [];
  const values  = [];
  let i = 1;

  for (const f of FIELDS) {
    if (req.body[f] === undefined) continue;
    if (f === 'status' && !ALLOWED_STATUSES.includes(req.body[f])) continue;
    if (f === 'billing_model' && !BILLING_MODELS.includes(req.body[f])) continue;
    updates.push(`${f} = $${i++}`);
    values.push(req.body[f] ?? null);
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update.' });
  updates.push(`updated_at = NOW()`);
  values.push(req.params.id, req.accountId);

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows } = await db.query(`
      UPDATE projects SET ${updates.join(', ')}
      WHERE id = $${i} AND account_id = $${i + 1}
      RETURNING *
    `, values);

    if (!rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found.' });
    }

    if (req.body.status !== undefined) {
      await logActivity(db, {
        accountId: req.accountId, projectId: req.params.id, userId: req.userId,
        type: 'status_changed', body: `Status changed to ${req.body.status}.`,
      });
    }

    await db.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    db.release();
  }
});

// ── DELETE /api/projects/:id — cancel ────────────────────
router.delete('/:id', requireAuth, requireRole('owner'), cap, async (req, res) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rowCount } = await db.query(`
      UPDATE projects SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND account_id = $2 AND status != 'cancelled'
    `, [req.params.id, req.accountId]);

    if (!rowCount) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found or already cancelled.' });
    }

    await logActivity(db, {
      accountId: req.accountId, projectId: req.params.id, userId: req.userId,
      type: 'cancelled', body: 'Project cancelled.',
    });

    await db.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    db.release();
  }
});

// ═══════════════════════════════════════════════════════════
// WORK ORDERS (jobs with project_id)
// ═══════════════════════════════════════════════════════════

// GET /api/projects/:id/work-orders
router.get('/:id/work-orders', requireAuth, requireRole('owner', 'manager', 'staff'), cap, async (req, res) => {
  try {
    const check = await pool.query(
      `SELECT id FROM projects WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Project not found.' });

    const { status: statusFilter, priority: priorityFilter } = req.query;
    const extraConditions = [];
    if (statusFilter) extraConditions.push(`j.status = '${statusFilter.replace(/'/g, "''")}'`);
    if (priorityFilter) extraConditions.push(`j.priority = '${priorityFilter.replace(/'/g, "''")}'`);
    const extraWhere = extraConditions.length ? ' AND ' + extraConditions.join(' AND ') : '';

    const { rows } = await pool.query(`
      SELECT j.*,
             u.name AS tech_name,
             COALESCE(t.task_count, 0)::int    AS task_count,
             COALESCE(t.complete_count, 0)::int AS complete_count,
             COALESCE(m.material_cost, 0)::int  AS material_cost,
             COALESCE(m.price_total, 0)::int    AS material_price,
             COALESCE(tm.team_members, '[]'::json) AS team_members
      FROM jobs j
      LEFT JOIN users u ON u.id = j.tech_id
      LEFT JOIN (
        SELECT job_id,
               COUNT(*) AS task_count,
               SUM(CASE WHEN is_complete THEN 1 ELSE 0 END) AS complete_count
        FROM work_order_tasks GROUP BY job_id
      ) t ON t.job_id = j.id
      LEFT JOIN (
        SELECT job_id,
               SUM(cost_cents  * quantity)::int AS material_cost,
               SUM(price_cents * quantity)::int AS price_total
        FROM work_order_materials WHERE job_id IS NOT NULL GROUP BY job_id
      ) m ON m.job_id = j.id
      LEFT JOIN (
        SELECT ja.job_id,
               json_agg(
                 json_build_object(
                   'user_id',        ja.user_id,
                   'member_name',    au.name,
                   'assignment_role',ja.assignment_role,
                   'is_primary',     ja.is_primary
                 ) ORDER BY ja.is_primary DESC, au.name
               ) AS team_members
        FROM job_assignments ja
        JOIN users au ON au.id = ja.user_id
        WHERE ja.account_id = $2 AND ja.removed_at IS NULL
        GROUP BY ja.job_id
      ) tm ON tm.job_id = j.id
      WHERE j.project_id = $1 AND j.account_id = $2 AND j.deleted_at IS NULL${extraWhere}
      ORDER BY j.work_order_number ASC NULLS LAST, j.created_at ASC
    `, [req.params.id, req.accountId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/work-orders
router.post('/:id/work-orders', requireAuth, requireRole('owner', 'manager'), cap, async (req, res) => {
  const {
    title, description, assignment,
    status = 'draft',
    scheduled_at, duration_minutes, priority = 'normal',
    service_address, service_city, service_state, service_zip,
    location_id, instructions,
    tech_id: legacyTechId,
  } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'Work order title is required.' });

  const members       = assignment?.members || [];
  const primaryMember = members.find(m => m.isPrimary) || members[0] || null;
  const effectiveTechId = primaryMember?.userId || legacyTechId || null;

  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    const projCheck = await db.query(
      `SELECT id, client_id FROM projects WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!projCheck.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found.' });
    }
    const proj  = projCheck.rows[0];
    const woNum = await nextWorkOrderNumber(db, req.params.id);

    const { rows } = await db.query(`
      INSERT INTO jobs (
        account_id, project_id, work_order_number,
        title, description, client_id, tech_id, status,
        scheduled_at, duration_minutes, priority,
        service_address, service_city, service_state, service_zip,
        location_id, instructions, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [
      req.accountId, req.params.id, woNum,
      title.trim(), description || null,
      proj.client_id, effectiveTechId, status,
      scheduled_at || null, duration_minutes || null, priority,
      service_address || null, service_city || null,
      service_state || null, service_zip || null,
      location_id || null, instructions || null, req.userId,
    ]);

    const jobId = rows[0].id;
    for (const m of members) {
      await db.query(`
        INSERT INTO job_assignments
          (account_id, job_id, user_id, assignment_role, is_primary, status, assigned_at, assigned_by)
        VALUES ($1, $2, $3, $4, $5, 'accepted', NOW(), $6)
      `, [req.accountId, jobId, m.userId, m.assignmentRole || 'technician', m.isPrimary || false, req.userId]);
    }

    await logActivity(db, {
      accountId: req.accountId, projectId: req.params.id, userId: req.userId,
      type: 'work_order_added',
      body: `Work Order WO-${String(woNum).padStart(3, '0')} "${title.trim()}" added.`,
    });

    await db.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('[WO create]', err.message);
    res.status(500).json({ error: woDbError(err) });
  } finally {
    db.release();
  }
});

// PATCH /api/projects/:id/work-orders/:woId
router.patch('/:id/work-orders/:woId', requireAuth, requireRole('owner', 'manager'), cap, async (req, res) => {
  const { assignment } = req.body;
  const members = assignment?.members || [];

  // Derive tech_id from primary assignee for Dispatch backward compat
  if (assignment) {
    const primary = members.find(m => m.isPrimary) || members[0] || null;
    if (primary) req.body.tech_id = primary.userId;
    else if (members.length === 0) req.body.tech_id = null;
  }

  const WO_FIELDS = [
    'title', 'description', 'tech_id', 'status', 'scheduled_at',
    'duration_minutes', 'priority',
    'service_address', 'service_city', 'service_state', 'service_zip',
    'location_id', 'instructions',
  ];
  const updates = [];
  const values  = [];
  let i = 1;

  for (const f of WO_FIELDS) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] ?? null);
    }
  }
  if (!updates.length && !assignment) return res.status(400).json({ error: 'No valid fields to update.' });

  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    let result;
    if (updates.length) {
      updates.push(`updated_at = NOW()`);
      values.push(req.params.woId, req.params.id, req.accountId);
      const { rows } = await db.query(`
        UPDATE jobs SET ${updates.join(', ')}
        WHERE id = $${i} AND project_id = $${i + 1} AND account_id = $${i + 2} AND deleted_at IS NULL
        RETURNING *
      `, values);
      if (!rows.length) {
        await db.query('ROLLBACK');
        return res.status(404).json({ error: 'Work order not found.' });
      }
      result = rows[0];
    } else {
      const { rows } = await db.query(
        `SELECT * FROM jobs WHERE id = $1 AND project_id = $2 AND account_id = $3 AND deleted_at IS NULL`,
        [req.params.woId, req.params.id, req.accountId]
      );
      if (!rows.length) {
        await db.query('ROLLBACK');
        return res.status(404).json({ error: 'Work order not found.' });
      }
      result = rows[0];
    }

    if (assignment) {
      await db.query(
        `UPDATE job_assignments SET removed_at = NOW(), removed_by = $1
         WHERE job_id = $2 AND account_id = $3 AND removed_at IS NULL`,
        [req.userId, req.params.woId, req.accountId]
      );
      for (const m of members) {
        await db.query(`
          INSERT INTO job_assignments
            (account_id, job_id, user_id, assignment_role, is_primary, status, assigned_at, assigned_by)
          VALUES ($1, $2, $3, $4, $5, 'accepted', NOW(), $6)
        `, [req.accountId, req.params.woId, m.userId, m.assignmentRole || 'technician', m.isPrimary || false, req.userId]);
      }
    }

    await db.query('COMMIT');
    res.json(result);
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('[WO update]', err.message);
    res.status(500).json({ error: woDbError(err) });
  } finally {
    db.release();
  }
});

// DELETE /api/projects/:id/work-orders/:woId — soft delete
router.delete('/:id/work-orders/:woId', requireAuth, requireRole('owner', 'manager'), cap, async (req, res) => {
  try {
    const { rowCount } = await pool.query(`
      UPDATE jobs SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND project_id = $2 AND account_id = $3 AND deleted_at IS NULL
    `, [req.params.woId, req.params.id, req.accountId]);
    if (!rowCount) return res.status(404).json({ error: 'Work order not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// TASKS (checklist per work order)
// ═══════════════════════════════════════════════════════════

// GET /api/projects/:id/work-orders/:woId/tasks
router.get('/:id/work-orders/:woId/tasks', requireAuth, requireRole('owner', 'manager', 'staff'), cap, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, u.name AS completed_by_name
      FROM work_order_tasks t
      LEFT JOIN users u ON u.id = t.completed_by
      WHERE t.job_id = $1 AND t.account_id = $2
      ORDER BY t.sort_order ASC, t.created_at ASC
    `, [req.params.woId, req.accountId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/work-orders/:woId/tasks
router.post('/:id/work-orders/:woId/tasks', requireAuth, requireRole('owner', 'manager'), cap, async (req, res) => {
  const { title, sort_order = 0 } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Task title is required.' });
  try {
    const { rows } = await pool.query(`
      INSERT INTO work_order_tasks (account_id, job_id, title, sort_order)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [req.accountId, req.params.woId, title.trim(), sort_order]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/projects/:id/work-orders/:woId/tasks/:taskId
router.patch('/:id/work-orders/:woId/tasks/:taskId', requireAuth, requireRole('owner', 'manager', 'staff'), cap, async (req, res) => {
  const { is_complete, title, sort_order } = req.body;
  const updates = [];
  const values  = [];
  let i = 1;

  if (title !== undefined)      { updates.push(`title = $${i++}`);      values.push(title); }
  if (sort_order !== undefined) { updates.push(`sort_order = $${i++}`); values.push(sort_order); }
  if (is_complete !== undefined) {
    updates.push(`is_complete = $${i++}`);   values.push(is_complete);
    updates.push(`completed_at = $${i++}`);  values.push(is_complete ? new Date().toISOString() : null);
    updates.push(`completed_by = $${i++}`);  values.push(is_complete ? req.userId : null);
  }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update.' });
  values.push(req.params.taskId, req.accountId);

  try {
    const { rows } = await pool.query(`
      UPDATE work_order_tasks SET ${updates.join(', ')}
      WHERE id = $${i} AND account_id = $${i + 1} RETURNING *
    `, values);
    if (!rows.length) return res.status(404).json({ error: 'Task not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id/work-orders/:woId/tasks/:taskId
router.delete('/:id/work-orders/:woId/tasks/:taskId', requireAuth, requireRole('owner', 'manager'), cap, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM work_order_tasks WHERE id = $1 AND account_id = $2`,
      [req.params.taskId, req.accountId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Task not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// MATERIALS
// ═══════════════════════════════════════════════════════════

// GET /api/projects/:id/materials
router.get('/:id/materials', requireAuth, requireRole('owner', 'manager', 'staff'), cap, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.*, j.title AS work_order_title, j.work_order_number
      FROM work_order_materials m
      LEFT JOIN jobs j ON j.id = m.job_id
      WHERE m.project_id = $1 AND m.account_id = $2
      ORDER BY m.created_at ASC
    `, [req.params.id, req.accountId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/materials
router.post('/:id/materials', requireAuth, requireRole('owner', 'manager'), cap, async (req, res) => {
  const {
    name, type = 'material', description, vendor,
    quantity = 1, unit = 'each',
    cost_cents = 0, price_cents = 0,
    billable = false, purchase_date, job_id,
  } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Item name is required.' });

  const projCheck = await pool.query(
    `SELECT id FROM projects WHERE id = $1 AND account_id = $2`,
    [req.params.id, req.accountId]
  );
  if (!projCheck.rows.length) return res.status(404).json({ error: 'Project not found.' });

  try {
    const { rows } = await pool.query(`
      INSERT INTO work_order_materials
        (account_id, project_id, job_id, type, name, description, vendor,
         quantity, unit, cost_cents, price_cents, billable, purchase_date, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
    `, [
      req.accountId, req.params.id, job_id || null,
      type || 'material', name.trim(), description || null, vendor || null,
      parseFloat(quantity) || 1, unit || 'each',
      Math.round(parseFloat(cost_cents)) || 0,
      billable ? (Math.round(parseFloat(price_cents)) || 0) : 0,
      billable === true || billable === 'true',
      purchase_date || null, req.userId,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Materials create]', err.message);
    res.status(500).json({ error: "We couldn't add this item. Your information has been preserved. Please try again." });
  }
});

// PATCH /api/projects/:id/materials/:matId
router.patch('/:id/materials/:matId', requireAuth, requireRole('owner', 'manager'), cap, async (req, res) => {
  const MAT_FIELDS = [
    'name', 'type', 'description', 'vendor',
    'quantity', 'unit', 'cost_cents', 'price_cents',
    'billable', 'purchase_date', 'job_id',
  ];
  const INT_FIELDS  = new Set(['cost_cents', 'price_cents']);
  const FLOAT_FIELDS = new Set(['quantity']);
  const BOOL_FIELDS  = new Set(['billable']);

  const updates = [];
  const values  = [];
  let i = 1;

  for (const f of MAT_FIELDS) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      let v = req.body[f] ?? null;
      if (INT_FIELDS.has(f))   v = Math.round(parseFloat(v)) || 0;
      if (FLOAT_FIELDS.has(f)) v = parseFloat(v) || 1;
      if (BOOL_FIELDS.has(f))  v = v === true || v === 'true';
      values.push(v);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update.' });
  updates.push(`updated_at = NOW()`);
  values.push(req.params.matId, req.params.id, req.accountId);

  try {
    const { rows } = await pool.query(`
      UPDATE work_order_materials SET ${updates.join(', ')}
      WHERE id = $${i} AND project_id = $${i + 1} AND account_id = $${i + 2} RETURNING *
    `, values);
    if (!rows.length) return res.status(404).json({ error: 'Item not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Materials update]', err.message);
    res.status(500).json({ error: "We couldn't save this item. Please try again." });
  }
});

// DELETE /api/projects/:id/materials/:matId
router.delete('/:id/materials/:matId', requireAuth, requireRole('owner', 'manager'), cap, async (req, res) => {
  try {
    const { rowCount } = await pool.query(`
      DELETE FROM work_order_materials
      WHERE id = $1 AND project_id = $2 AND account_id = $3
    `, [req.params.matId, req.params.id, req.accountId]);
    if (!rowCount) return res.status(404).json({ error: 'Item not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Materials delete]', err.message);
    res.status(500).json({ error: "We couldn't delete this item. Please try again." });
  }
});

// ═══════════════════════════════════════════════════════════
// FINANCIALS
// ═══════════════════════════════════════════════════════════

// GET /api/projects/:id/financials
router.get('/:id/financials', requireAuth, requireRole('owner', 'manager'), cap, async (req, res) => {
  try {
    const projRes = await pool.query(
      `SELECT contract_value FROM projects WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!projRes.rows.length) return res.status(404).json({ error: 'Project not found.' });

    const [matRes, invRes, woRes] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(cost_cents  * quantity), 0)::int AS total_material_cost,
          COALESCE(SUM(price_cents * quantity), 0)::int AS total_material_price
        FROM work_order_materials WHERE project_id = $1 AND account_id = $2
      `, [req.params.id, req.accountId]),

      pool.query(`
        SELECT
          COALESCE(SUM(ROUND(amount * 100)), 0)::int AS total_invoiced,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN ROUND(amount * 100) ELSE 0 END), 0)::int AS total_paid
        FROM invoices WHERE project_id = $1 AND account_id = $2
      `, [req.params.id, req.accountId]),

      pool.query(`
        SELECT
          COUNT(*)::int AS work_order_count,
          COUNT(CASE WHEN status = 'complete' THEN 1 END)::int AS completed_count
        FROM jobs WHERE project_id = $1 AND account_id = $2 AND deleted_at IS NULL
      `, [req.params.id, req.accountId]),
    ]);

    res.json({
      contract_value:       projRes.rows[0].contract_value || 0,
      total_material_cost:  matRes.rows[0].total_material_cost,
      total_material_price: matRes.rows[0].total_material_price,
      total_invoiced:       invRes.rows[0].total_invoiced,
      total_paid:           invRes.rows[0].total_paid,
      work_order_count:     woRes.rows[0].work_order_count,
      completed_work_orders: woRes.rows[0].completed_count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ACTIVITY
// ═══════════════════════════════════════════════════════════

// GET /api/projects/:id/activity
router.get('/:id/activity', requireAuth, requireRole('owner', 'manager', 'staff'), cap, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, u.name AS user_name
      FROM project_activity a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.project_id = $1 AND a.account_id = $2
      ORDER BY a.created_at DESC
      LIMIT 100
    `, [req.params.id, req.accountId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/activity — manual note
router.post('/:id/activity', requireAuth, requireRole('owner', 'manager', 'staff'), cap, async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Note body is required.' });

  try {
    const check = await pool.query(
      `SELECT id FROM projects WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Project not found.' });

    const { rows } = await pool.query(`
      INSERT INTO project_activity (account_id, project_id, user_id, type, body)
      VALUES ($1,$2,$3,'note',$4) RETURNING *
    `, [req.accountId, req.params.id, req.userId, body.trim()]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
