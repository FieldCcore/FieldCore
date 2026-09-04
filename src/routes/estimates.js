const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const pool     = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const email    = require('../services/email');
const activity = require('../services/estimateActivityService');

const EVENTS = activity.EVENTS;

function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Fields whose presence in a PATCH body constitutes a material change on a sent estimate.
// A material change snapshots the current state as a revision before applying updates.
const MATERIAL_FIELDS = [
  'title','line_items','estimate_date','discount',
  'deposit_required','deposit_type','deposit_percentage','deposit_fixed_amount',
  'validity_days','client_message','custom_terms',
];

let _tableReady = false;
async function ensureTable() {
  if (_tableReady) return;
  const c = await pool.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS estimates (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        client_id      UUID NOT NULL REFERENCES clients(id),
        job_id         UUID REFERENCES jobs(id),
        title          TEXT NOT NULL DEFAULT 'Service Estimate',
        line_items     JSONB NOT NULL DEFAULT '[]',
        amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
        tax_amount     NUMERIC(10,2) DEFAULT 0,
        status         TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','sent','signed','declined','expired')),
        notes          TEXT,
        valid_until    DATE,
        signing_token  TEXT UNIQUE,
        signed_at      TIMESTAMPTZ,
        signature_data TEXT,
        sent_at        TIMESTAMPTZ,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_estimates_account ON estimates(account_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_estimates_client  ON estimates(client_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_estimates_token   ON estimates(signing_token)`);

    // Additive columns — safe to run each boot
    const cols = [
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS estimate_number      INTEGER`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS estimate_date        DATE`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS client_message       TEXT`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS discount             NUMERIC(10,2) DEFAULT 0`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS location_id          UUID`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS converted_invoice_id UUID`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS converted_job_id     UUID REFERENCES jobs(id)`,
      // Validity + deposit structured fields
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS validity_days          INTEGER CHECK (validity_days IN (30,60,90))`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_required       BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_type           TEXT CHECK (deposit_type IN ('percentage','fixed'))`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_percentage     NUMERIC(5,2) CHECK (deposit_percentage > 0 AND deposit_percentage <= 100)`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_fixed_amount   NUMERIC(10,2) CHECK (deposit_fixed_amount >= 0)`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS custom_terms           TEXT`,
      // View tracking
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS view_count            INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS first_viewed_at       TIMESTAMPTZ`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS last_viewed_at        TIMESTAMPTZ`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS follow_up_sent_at     TIMESTAMPTZ`,
      // Revision tracking
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS revision_number       INTEGER NOT NULL DEFAULT 1`,
    ];
    for (const sql of cols) await c.query(sql);

    // Revision snapshot table — preserves full estimate state before a material edit
    await c.query(`
      CREATE TABLE IF NOT EXISTS estimate_revisions (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        estimate_id     UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
        revision_number INTEGER NOT NULL,
        snapshot        JSONB NOT NULL,
        created_by      UUID REFERENCES users(id),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_estimate_revisions_unique
        ON estimate_revisions(estimate_id, revision_number)
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_estimate_revisions_est ON estimate_revisions(estimate_id)`);

    // Canonical activity timeline
    await c.query(`
      CREATE TABLE IF NOT EXISTS estimate_activity (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        estimate_id      UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
        client_id        UUID REFERENCES clients(id),
        related_job_id   UUID REFERENCES jobs(id),
        event_type       TEXT NOT NULL,
        actor_id         UUID REFERENCES users(id),
        actor_type       TEXT NOT NULL DEFAULT 'user',
        summary          TEXT,
        details          JSONB NOT NULL DEFAULT '{}',
        idempotency_key  TEXT UNIQUE,
        occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_est_activity_estimate ON estimate_activity(estimate_id, occurred_at DESC)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_est_activity_account  ON estimate_activity(account_id, occurred_at DESC)`);

    _tableReady = true;
    console.log('[estimates] table ready');
  } catch (err) {
    console.error('[estimates] ensureTable failed:', err.message);
  } finally {
    c.release();
  }
}

router.use((req, res, next) => { ensureTable().then(next).catch(next); });

// ─── Date helper: adds days to yyyy-MM-dd without UTC shift ─────────────────
function calculateExpiry(dateStr, days) {
  if (!dateStr || !days) return null;
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() + parseInt(days));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Totals calculator ───────────────────────────────────────────────────────
function computeTotals(lineItems, discount, taxRate) {
  const validItems = lineItems.map(item => {
    const qty       = Math.max(0, parseFloat(item.quantity) || 1);
    const price     = Math.max(0, parseFloat(item.unit_price ?? item.amount) || 0);
    const lineTotal = parseFloat((qty * price).toFixed(2));
    return {
      name:        item.name || item.description || 'Service',
      description: item.description || '',
      quantity:    qty,
      unit_price:  price,
      taxable:     item.taxable !== false,
      line_total:  lineTotal,
      amount:      lineTotal,
    };
  });

  const subtotal       = parseFloat(validItems.reduce((s, i) => s + i.line_total, 0).toFixed(2));
  const discountAmount = parseFloat(Math.min(Math.max(parseFloat(discount) || 0, 0), subtotal).toFixed(2));

  const taxableSubtotal      = parseFloat(
    validItems.filter(i => i.taxable).reduce((s, i) => s + i.line_total, 0).toFixed(2)
  );
  const discountRatio        = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxableAfterDiscount = parseFloat((taxableSubtotal * (1 - discountRatio)).toFixed(2));
  const taxAmount            = parseFloat((taxableAfterDiscount * parseFloat(taxRate || 0)).toFixed(2));
  const total                = parseFloat((subtotal - discountAmount + taxAmount).toFixed(2));

  return { validItems, subtotal, discountAmount, taxAmount, total };
}

// ─── GET /api/estimates — list ───────────────────────────────────────────────
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, c.name AS client_name, c.email AS client_email
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       WHERE e.account_id = $1
       ORDER BY e.created_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/estimates — create ───────────────────────────────────────────
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    client_id, title, line_items, notes, job_id,
    estimate_date, client_message, terms_and_conditions, discount, location_id,
    validity_days, deposit_required, deposit_type, deposit_percentage, deposit_fixed_amount, custom_terms,
  } = req.body;

  if (!client_id || !Array.isArray(line_items) || line_items.length === 0) {
    return res.status(400).json({ error: 'client_id and line_items are required' });
  }

  const vdays = parseInt(validity_days) || 30;
  if (![30, 60, 90].includes(vdays)) {
    return res.status(400).json({ error: 'validity_days must be 30, 60, or 90' });
  }

  const depReq  = deposit_required === true || deposit_required === 'true';
  const depType = depReq ? deposit_type : null;
  let depPerc   = null;
  let depFixed  = null;
  if (depReq) {
    if (depType === 'percentage') {
      const p = parseFloat(deposit_percentage);
      if (isNaN(p) || p <= 0 || p > 100) return res.status(400).json({ error: 'deposit_percentage must be between 0 and 100' });
      depPerc = p;
    } else if (depType === 'fixed') {
      const f = parseFloat(deposit_fixed_amount);
      if (isNaN(f) || f < 0) return res.status(400).json({ error: 'deposit_fixed_amount must be >= 0' });
      depFixed = f;
    }
  }

  try {
    const [settingsRes, numRes] = await Promise.all([
      pool.query(`SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]),
      pool.query(`SELECT COALESCE(MAX(estimate_number), 0) + 1 AS next FROM estimates WHERE account_id = $1`, [req.accountId]),
    ]);
    const taxRate     = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
    const estimateNum = numRes.rows[0].next;
    const { validItems, discountAmount, taxAmount, total } = computeTotals(line_items, discount, taxRate);

    const estDateStr = estimate_date || new Date().toISOString().slice(0, 10);
    const validUntil = calculateExpiry(estDateStr, vdays);

    const { rows } = await pool.query(
      `INSERT INTO estimates
         (account_id, client_id, job_id, title, line_items, amount, tax_amount,
          notes, valid_until, estimate_number, estimate_date, client_message,
          terms_and_conditions, discount, location_id,
          validity_days, deposit_required, deposit_type,
          deposit_percentage, deposit_fixed_amount, custom_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        req.accountId, client_id, job_id || null,
        title || 'Service Estimate',
        JSON.stringify(validItems),
        total, taxAmount,
        notes || null,
        validUntil,
        estimateNum,
        estDateStr,
        client_message || null,
        terms_and_conditions || null,
        discountAmount,
        location_id || null,
        vdays,
        depReq,
        depType,
        depPerc,
        depFixed,
        custom_terms || null,
      ]
    );

    const est = rows[0];

    // Record creation activity (fire-and-forget)
    activity.record({
      accountId:  est.account_id,
      estimateId: est.id,
      clientId:   est.client_id,
      eventType:  EVENTS.CREATED,
      actorId:    req.userId,
      summary:    `Estimate #${est.estimate_number} created`,
      details:    { estimate_number: est.estimate_number, title: est.title, amount: est.amount },
      idempotencyKey: `estimate.created:${est.id}`,
    }).catch(err => console.error('[estimates] activity.created failed:', err.message));

    res.status(201).json(est);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/estimates/next-number ─────────────────────────────────────────
// Must be registered BEFORE /:id to avoid matching "next-number" as an ID.
router.get('/next-number', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const [numRes, settingsRes] = await Promise.all([
      pool.query(`SELECT COALESCE(MAX(estimate_number), 0) + 1 AS next FROM estimates WHERE account_id = $1`, [req.accountId]),
      pool.query(`SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]),
    ]);
    res.json({
      next_number: numRes.rows[0].next,
      tax_rate:    parseFloat(settingsRes.rows[0]?.tax_rate || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/estimates/sign/:token — public: fetch for signing page ─────────
router.get('/sign/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, c.name AS client_name, c.email AS client_email,
              a.name AS business_name
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       JOIN accounts a ON a.id = e.account_id
       WHERE e.signing_token = $1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Estimate not found or link expired.' });
    const est = rows[0];

    if (est.status === 'signed') return res.json({ ...est, already_signed: true });
    if (est.status === 'expired') return res.status(410).json({ error: 'This estimate has expired.' });
    if (est.valid_until && new Date(est.valid_until) < new Date()) {
      return res.status(410).json({ error: 'This estimate has expired.' });
    }

    // Track customer view — first real view fires activity + notification; repeats only update metadata.
    const wasNeverViewed = !est.first_viewed_at;
    pool.query(
      `UPDATE estimates
       SET view_count = view_count + 1,
           first_viewed_at = COALESCE(first_viewed_at, NOW()),
           last_viewed_at  = NOW()
       WHERE signing_token = $1`,
      [req.params.token]
    ).then(() => {
      if (wasNeverViewed) {
        return activity.recordWithNotify(
          {
            accountId:      est.account_id,
            estimateId:     est.id,
            clientId:       est.client_id,
            eventType:      EVENTS.VIEWED,
            actorType:      'customer',
            summary:        `${est.client_name} viewed Estimate #${est.estimate_number}`,
            details:        { client_name: est.client_name, view_count: 1 },
            idempotencyKey: `estimate.viewed.first:${est.id}`,
          },
          {
            type:  'estimate_viewed',
            title: `Estimate #${est.estimate_number} viewed`,
            body:  `${est.client_name} just opened your estimate. Follow up while it's top of mind.`,
            link:  '/estimates',
          }
        );
      }
    }).catch(err => console.error('[estimates] view tracking failed:', err.message));

    res.json(est);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/estimates/sign/:token — public: submit signature ──────────────
router.post('/sign/:token', async (req, res) => {
  const { signature_data } = req.body;
  if (!signature_data) return res.status(400).json({ error: 'signature_data is required' });
  try {
    const { rows } = await pool.query(
      `UPDATE estimates
       SET status = 'signed', signed_at = NOW(), signature_data = $1
       WHERE signing_token = $2
         AND status IN ('sent','draft')
       RETURNING *`,
      [signature_data, req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Estimate not found or already signed.' });

    const est = rows[0];

    // Fetch client name for the notification body
    pool.query(`SELECT name FROM clients WHERE id = $1`, [est.client_id])
      .then(r => {
        const clientName = r.rows[0]?.name || 'Your client';
        return activity.recordWithNotify(
          {
            accountId:      est.account_id,
            estimateId:     est.id,
            clientId:       est.client_id,
            eventType:      EVENTS.APPROVED,
            actorType:      'customer',
            summary:        `${clientName} approved Estimate #${est.estimate_number}`,
            details:        { signed_at: est.signed_at, client_name: clientName },
            idempotencyKey: `estimate.approved:${est.id}`,
          },
          {
            type:  'estimate_approved',
            title: `Estimate #${est.estimate_number} approved`,
            body:  `${clientName} has signed and approved your estimate. Convert it to a job when ready.`,
            link:  '/estimates',
          }
        );
      })
      .catch(err => console.error('[estimates] activity.approved failed:', err.message));

    res.json({ success: true, signed_at: est.signed_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/estimates/:id ──────────────────────────────────────────────────
router.get('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, c.name AS client_name, c.email AS client_email,
              inv.invoice_number AS converted_invoice_number
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN invoices inv ON inv.id = e.converted_invoice_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/estimates/:id/activity — activity timeline ─────────────────────
router.get('/:id/activity', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    // Tenant-isolated access check
    const { rows: check } = await pool.query(
      `SELECT id FROM estimates WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!check.length) return res.status(404).json({ error: 'Not found' });

    const { rows } = await pool.query(
      `SELECT ea.*, u.name AS actor_name
       FROM estimate_activity ea
       LEFT JOIN users u ON u.id = ea.actor_id
       WHERE ea.estimate_id = $1 AND ea.account_id = $2
       ORDER BY ea.occurred_at ASC, ea.created_at ASC`,
      [req.params.id, req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/estimates/:id — update estimate ──────────────────────────────
// Draft: edit freely.
// Sent: material changes create a revision snapshot before applying updates.
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    title, line_items, notes,
    estimate_date, client_message, terms_and_conditions, discount, location_id,
    validity_days, deposit_required, deposit_type, deposit_percentage, deposit_fixed_amount, custom_terms,
  } = req.body;
  try {
    const estRes = await pool.query(
      `SELECT * FROM estimates WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]
    );
    if (!estRes.rows.length) return res.status(404).json({ error: 'Not found' });

    const existing = estRes.rows[0];
    if (!['draft', 'sent'].includes(existing.status)) {
      return res.status(400).json({ error: 'Can only edit draft or sent estimates' });
    }

    // For sent estimates: detect material changes and snapshot before applying
    if (existing.status === 'sent') {
      const hasMaterialChange = MATERIAL_FIELDS.some(f => req.body[f] !== undefined);
      if (hasMaterialChange) {
        const revNum = existing.revision_number || 1;
        await pool.query(
          `INSERT INTO estimate_revisions (account_id, estimate_id, revision_number, snapshot, created_by)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (estimate_id, revision_number) DO NOTHING`,
          [req.accountId, existing.id, revNum, JSON.stringify(existing), req.userId]
        );
        await pool.query(
          `UPDATE estimates SET revision_number = revision_number + 1 WHERE id = $1 AND account_id = $2`,
          [existing.id, req.accountId]
        );
        activity.record({
          accountId:  req.accountId,
          estimateId: existing.id,
          clientId:   existing.client_id,
          eventType:  EVENTS.REVISION_CREATED,
          actorId:    req.userId,
          summary:    `Revision ${revNum + 1} created`,
          details:    { previous_revision: revNum, new_revision: revNum + 1 },
        }).catch(err => console.error('[estimates] activity.revision failed:', err.message));
      }
    }

    let amount     = existing.amount;
    let taxAmt     = existing.tax_amount;
    let validItems = existing.line_items;

    if (line_items) {
      const settingsRes = await pool.query(
        `SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]
      );
      const taxRate  = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
      const disc     = discount !== undefined ? discount : (existing.discount || 0);
      const computed = computeTotals(line_items, disc, taxRate);
      validItems     = computed.validItems;
      amount         = computed.total;
      taxAmt         = computed.taxAmount;
    }

    const newEstDate  = estimate_date  !== undefined ? estimate_date  : existing.estimate_date;
    const newVdays    = validity_days  !== undefined ? parseInt(validity_days) : existing.validity_days;
    if (newVdays !== null && newVdays !== undefined && ![30, 60, 90].includes(newVdays)) {
      return res.status(400).json({ error: 'validity_days must be 30, 60, or 90' });
    }
    const newValidUntil = (newEstDate && newVdays) ? calculateExpiry(String(newEstDate), newVdays) : existing.valid_until;

    const depReq = deposit_required !== undefined
      ? (deposit_required === true || deposit_required === 'true')
      : existing.deposit_required;

    const { rows } = await pool.query(
      `UPDATE estimates SET
         title                 = COALESCE($1,  title),
         line_items            = $2,
         notes                 = COALESCE($3,  notes),
         valid_until           = $4,
         amount                = $5,
         tax_amount            = $6,
         estimate_date         = COALESCE($7,  estimate_date),
         client_message        = COALESCE($8,  client_message),
         terms_and_conditions  = COALESCE($9,  terms_and_conditions),
         discount              = COALESCE($10, discount),
         location_id           = COALESCE($11, location_id),
         validity_days         = COALESCE($12, validity_days),
         deposit_required      = $13,
         deposit_type          = COALESCE($14, deposit_type),
         deposit_percentage    = COALESCE($15, deposit_percentage),
         deposit_fixed_amount  = COALESCE($16, deposit_fixed_amount),
         custom_terms          = COALESCE($17, custom_terms)
       WHERE id = $18 AND account_id = $19
       RETURNING *`,
      [
        title, JSON.stringify(validItems), notes, newValidUntil,
        amount, taxAmt,
        estimate_date, client_message, terms_and_conditions, discount, location_id,
        newVdays !== undefined ? newVdays : null,
        depReq,
        deposit_type          !== undefined ? deposit_type          : null,
        deposit_percentage    !== undefined ? parseFloat(deposit_percentage)    : null,
        deposit_fixed_amount  !== undefined ? parseFloat(deposit_fixed_amount)  : null,
        custom_terms !== undefined ? custom_terms : null,
        req.params.id, req.accountId,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/estimates/:id/send — email signing link ───────────────────────
router.post('/:id/send', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, c.name AS client_name, c.email AS client_email, a.name AS business_name
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       JOIN accounts a ON a.id = e.account_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [req.params.id, req.accountId]
    );
    const est = rows[0];
    if (!est) return res.status(404).json({ error: 'Not found' });
    if (!est.client_email) return res.status(400).json({ error: 'Client has no email address' });

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `UPDATE estimates SET signing_token = $1, status = 'sent', sent_at = NOW() WHERE id = $2`,
      [token, est.id]
    );

    const appUrl  = process.env.APP_URL || 'https://www.getfieldcore.com';
    const signUrl = `${appUrl}/sign/${token}`;

    await email.send({
      to:      est.client_email,
      subject: `Estimate from ${est.business_name} — $${parseFloat(est.amount).toFixed(2)}`,
      html:    email.wrap(`
        <p>Hi ${escHtml(est.client_name?.split(' ')[0] || 'there')},</p>
        <p>${escHtml(est.business_name)} has sent you a service estimate for <strong>${escHtml(est.title)}</strong> totaling <strong>$${parseFloat(est.amount).toFixed(2)}</strong>.</p>
        <p>Please review and sign the estimate using the link below:</p>
        <div style="margin:24px 0">
          <a href="${signUrl}" style="display:inline-block;padding:12px 28px;background:#1C2333;color:#D6B58A;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none">Review &amp; Sign Estimate →</a>
        </div>
        ${est.valid_until ? `<p style="font-size:12px;color:#9ca3af">This estimate is valid until ${new Date(est.valid_until).toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric'})}.</p>` : ''}
      `),
    });

    // Record sent activity
    activity.record({
      accountId:  est.account_id,
      estimateId: est.id,
      clientId:   est.client_id,
      eventType:  EVENTS.SENT,
      actorId:    req.userId,
      summary:    `Estimate #${est.estimate_number} sent to ${est.client_email}`,
      details:    { sent_to: est.client_email, client_name: est.client_name },
    }).catch(err => console.error('[estimates] activity.sent failed:', err.message));

    res.json({ success: true, sign_url: signUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/estimates/:id/void — manually expire ─────────────────────────
router.post('/:id/void', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE estimates SET status = 'expired'
       WHERE id = $1 AND account_id = $2
         AND status IN ('draft','sent')
       RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found or already in terminal state' });

    const est = rows[0];
    activity.record({
      accountId:      est.account_id,
      estimateId:     est.id,
      clientId:       est.client_id,
      eventType:      EVENTS.DECLINED,
      actorId:        req.userId,
      summary:        `Estimate #${est.estimate_number} manually expired`,
      details:        { actor: 'staff' },
      idempotencyKey: `estimate.declined:${est.id}`,
    }).catch(err => console.error('[estimates] activity.declined failed:', err.message));

    res.json(est);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/estimates/:id/convert-to-job ──────────────────────────────────
router.post('/:id/convert-to-job', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const estRes = await pool.query(
      `SELECT e.*, c.address AS client_address, c.city AS client_city, c.state AS client_state
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [req.params.id, req.accountId]
    );
    const est = estRes.rows[0];
    if (!est) return res.status(404).json({ error: 'Estimate not found' });
    if (est.status !== 'signed') {
      return res.status(400).json({ error: 'Only signed estimates can be converted to jobs' });
    }
    if (est.converted_job_id) {
      return res.status(409).json({ error: 'This estimate has already been converted to a job', job_id: est.converted_job_id });
    }

    const { rows: [job] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, amount, notes,
                         service_address, service_city, service_state, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled') RETURNING *`,
      [req.accountId, est.client_id, est.title, est.amount, est.notes || null,
       est.client_address || null, est.client_city || null, est.client_state || null]
    );

    await pool.query(
      `UPDATE estimates SET converted_job_id = $1 WHERE id = $2`,
      [job.id, est.id]
    );

    // Record conversion activity
    activity.record({
      accountId:      est.account_id,
      estimateId:     est.id,
      clientId:       est.client_id,
      relatedJobId:   job.id,
      eventType:      EVENTS.CONVERTED_TO_JOB,
      actorId:        req.userId,
      summary:        `Converted to job`,
      details:        { job_id: job.id },
      idempotencyKey: `estimate.converted_to_job:${est.id}`,
    }).catch(err => console.error('[estimates] activity.converted failed:', err.message));

    res.status(201).json({ job, estimate_id: est.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
