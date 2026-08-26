const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const email  = require('../services/email');
const notify = require('../services/notify');
const PDFDoc = require('pdfkit');

function generateInvoicePdfBuffer(inv) {
  return new Promise((resolve, reject) => {
    const doc  = new PDFDoc({ margin: 50, size: 'LETTER' });
    const bufs = [];
    doc.on('data', d => bufs.push(d));
    doc.on('end',  () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const tax        = parseFloat(inv.tax_amount || 0);
    const total      = parseFloat(inv.amount || 0);
    const pretax     = parseFloat((total - tax).toFixed(2));
    const lineItems  = Array.isArray(inv.line_items) && inv.line_items.length > 0
      ? inv.line_items
      : [{ description: inv.service_type || 'Service', amount: pretax }];
    const fmtAmt     = n => `$${parseFloat(n || 0).toFixed(2)}`;
    const fmtDt      = d => d ? new Date(d).toLocaleDateString('en-US', { dateStyle: 'long' }) : 'N/A';
    const invNumDisplay = inv.invoice_number
      ? `#${inv.invoice_number}`
      : inv.id.slice(0, 8).toUpperCase();

    // Header
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#1C2333').text('FIELDCORE', { align: 'left' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(11).fillColor('#6b7280').text(inv.business_name || 'FieldCore');
    doc.moveDown(1.5);

    // Invoice title + meta
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1C2333').text('INVOICE');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280');
    doc.text(`Invoice: ${invNumDisplay}`);
    doc.text(`Date: ${fmtDt(inv.issued_date || inv.created_at)}`);
    if (inv.due_date) doc.text(`Due: ${fmtDt(inv.due_date)}`);
    if (inv.paid_at) doc.text(`Paid: ${fmtDt(inv.paid_at)}`);
    doc.moveDown(1);

    // Bill to
    doc.moveTo(50, doc.y).lineTo(560, doc.y).strokeColor('#e5e0d8').stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#9ca3af').text('BILL TO');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(12).fillColor('#1C2333').text(inv.client_name);
    if (inv.client_email) doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(inv.client_email);
    doc.moveDown(1);

    // Line items
    doc.moveTo(50, doc.y).lineTo(560, doc.y).strokeColor('#e5e0d8').stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#9ca3af');
    doc.text('DESCRIPTION', 50, doc.y, { width: 360 });
    doc.text('AMOUNT', 410, doc.y - doc.currentLineHeight(), { width: 100, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(560, doc.y).strokeColor('#e5e0d8').stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(11).fillColor('#1C2333');
    lineItems.forEach(item => {
      const y = doc.y;
      const desc = item.name || item.description || 'Service';
      const amt  = item.line_total ?? item.amount;
      doc.text(desc, 50, y, { width: 360 });
      doc.text(fmtAmt(amt), 410, y, { width: 100, align: 'right' });
      doc.moveDown(0.6);
    });
    doc.moveDown(0.4);

    // Totals
    doc.moveTo(360, doc.y).lineTo(560, doc.y).strokeColor('#e5e0d8').stroke();
    doc.moveDown(0.5);
    const subtotal = parseFloat(inv.subtotal || pretax);
    const discount = parseFloat(inv.discount_amount || 0);
    if (discount > 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280');
      doc.text('Subtotal', 360, doc.y, { width: 100 });
      doc.text(fmtAmt(subtotal), 460, doc.y - doc.currentLineHeight(), { width: 100, align: 'right' });
      doc.moveDown(0.5);
      doc.text('Discount', 360, doc.y, { width: 100 });
      doc.text(`-${fmtAmt(discount)}`, 460, doc.y - doc.currentLineHeight(), { width: 100, align: 'right' });
      doc.moveDown(0.5);
    }
    if (tax > 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280');
      if (discount === 0) {
        doc.text('Subtotal', 360, doc.y, { width: 100 });
        doc.text(fmtAmt(subtotal), 460, doc.y - doc.currentLineHeight(), { width: 100, align: 'right' });
        doc.moveDown(0.5);
      }
      doc.text('Tax', 360, doc.y, { width: 100 });
      doc.text(fmtAmt(tax), 460, doc.y - doc.currentLineHeight(), { width: 100, align: 'right' });
      doc.moveDown(0.5);
      doc.moveTo(360, doc.y).lineTo(560, doc.y).strokeColor('#e5e0d8').stroke();
      doc.moveDown(0.5);
    }
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#1C2333');
    doc.text('Total Due', 360, doc.y, { width: 100 });
    doc.text(fmtAmt(total), 460, doc.y - doc.currentLineHeight(), { width: 100, align: 'right' });
    doc.moveDown(2);

    // Status
    const statusColor = inv.status === 'paid' ? '#15803d' : '#b45309';
    doc.font('Helvetica-Bold').fontSize(14).fillColor(statusColor)
       .text(inv.status === 'paid' ? 'PAID' : 'PAYMENT DUE', { align: 'center' });

    if (inv.payment_link && inv.status !== 'paid') {
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280')
         .text(`Pay online: ${inv.payment_link}`, { align: 'center' });
    }

    if (inv.client_message) {
      doc.moveDown(1);
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(inv.client_message, { align: 'left' });
    }

    // Footer
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(560, doc.y).strokeColor('#e5e0d8').stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor('#9ca3af')
       .text(inv.terms || 'Thank you for your business.', { align: 'center' });

    doc.end();
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtPeriod(start, end) {
  if (!start || !end) return '';
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sm = months[s.getMonth()], em = months[e.getMonth()];
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${sm} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${sm} ${s.getDate()}–${em} ${e.getDate()}, ${e.getFullYear()}`;
}

// Returns the current billing period window for a given cadence.
// For interval-based cadences (weekly, every_N_weeks, biweekly, custom),
// startedAt is used as the epoch anchor so "every 2 weeks" means exactly 14 days,
// not "twice per calendar month."
function currentBillingPeriod(cadence, startedAt, intervalDays) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let ps, pe;

  // Normalize legacy 'biweekly' alias
  const c = cadence === 'biweekly' ? 'every_2_weeks' : cadence;

  if (c === 'monthly') {
    ps = new Date(today.getFullYear(), today.getMonth(), 1);
    pe = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (c === 'quarterly') {
    const q = Math.floor(today.getMonth() / 3);
    ps = new Date(today.getFullYear(), q * 3, 1);
    pe = new Date(today.getFullYear(), q * 3 + 3, 0);
  } else if (c === 'annual') {
    ps = new Date(today.getFullYear(), 0, 1);
    pe = new Date(today.getFullYear(), 11, 31);
  } else if (['weekly','every_2_weeks','every_3_weeks','every_4_weeks','custom'].includes(c)) {
    // True interval-based: count days from started_at anchor
    const days = c === 'weekly' ? 7
               : c === 'every_2_weeks' ? 14
               : c === 'every_3_weeks' ? 21
               : c === 'every_4_weeks' ? 28
               : (parseInt(intervalDays, 10) || 7);
    const ref = startedAt
      ? new Date(startedAt + 'T00:00:00')
      : new Date(today.getFullYear(), today.getMonth(), 1);
    const daysDiff = Math.floor((today - ref) / 86400000);
    const win = Math.max(0, Math.floor(daysDiff / days));
    ps = new Date(ref); ps.setDate(ref.getDate() + win * days);
    pe = new Date(ps);  pe.setDate(ps.getDate() + days - 1);
  } else {
    // Fallback: calendar month
    ps = new Date(today.getFullYear(), today.getMonth(), 1);
    pe = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  }
  return {
    period_start: ps.toISOString().slice(0, 10),
    period_end:   pe.toISOString().slice(0, 10),
  };
}

function computeDueDate(paymentTerms, issuedDate) {
  const termDays = { net_7: 7, net_15: 15, net_30: 30, net_45: 45, net_60: 60, net_90: 90 };
  const days = termDays[paymentTerms];
  if (!days) return null;
  const base = issuedDate ? new Date(issuedDate) : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function computeTotals(lineItems, discountType, discountValue, taxRate) {
  const validItems = lineItems.map(item => {
    const qty      = Math.max(0, parseFloat(item.quantity) || 1);
    const price    = Math.max(0, parseFloat(item.unit_price ?? item.amount) || 0);
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

  const subtotal = parseFloat(validItems.reduce((s, i) => s + i.line_total, 0).toFixed(2));

  let discountAmount = 0;
  if (discountType === 'fixed' && parseFloat(discountValue) > 0) {
    discountAmount = parseFloat(Math.min(parseFloat(discountValue), subtotal).toFixed(2));
  } else if (discountType === 'percent' && parseFloat(discountValue) > 0) {
    discountAmount = parseFloat((subtotal * parseFloat(discountValue) / 100).toFixed(2));
  }

  const taxableSubtotal = parseFloat(
    validItems.filter(i => i.taxable).reduce((s, i) => s + i.line_total, 0).toFixed(2)
  );
  const discountRatio        = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxableAfterDiscount = parseFloat((taxableSubtotal * (1 - discountRatio)).toFixed(2));
  const taxAmount            = parseFloat((taxableAfterDiscount * parseFloat(taxRate || 0)).toFixed(2));
  const total                = parseFloat((subtotal - discountAmount + taxAmount).toFixed(2));

  return { validItems, subtotal, discountAmount, taxAmount, total };
}

// ─── POST /api/invoices ───────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    source_type       = 'JOB',
    job_id,
    client_id:        bodyClientId,
    source_estimate_id,
    source_agreement_id,
    period_start,
    period_end,
    subject,
    line_items:       reqLineItems,
    discount_type,
    discount_value,
    discount_label,
    payment_terms     = 'due_on_receipt',
    due_date,
    issued_date,
    client_message,
    internal_notes,
    terms,
    payment_options,
    status:           reqStatus,
  } = req.body;

  if (!['JOB', 'MANUAL', 'ESTIMATE', 'AGREEMENT'].includes(source_type)) {
    return res.status(400).json({ error: 'source_type must be JOB, MANUAL, ESTIMATE, or AGREEMENT' });
  }

  const status = ['draft', 'pending', 'partially_paid'].includes(reqStatus) ? reqStatus : 'draft';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const settingsRes = await client.query(
      `SELECT COALESCE(tax_rate, 0) AS tax_rate FROM booking_settings WHERE account_id = $1`,
      [req.accountId]
    );
    const taxRate = parseFloat(settingsRes.rows[0]?.tax_rate || 0);

    let finalClientId           = null;
    let finalJobId              = null;
    let finalSourceEstimateId   = null;
    let finalSourceAgreementId  = null;
    let finalPeriodStart        = null;
    let finalPeriodEnd          = null;
    let finalSubject            = subject || null;
    let finalClientMessage      = client_message || null;
    let baseLineItems           = [];

    if (source_type === 'JOB') {
      if (!job_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'job_id is required for JOB source' });
      }
      const jobRes = await client.query(
        `SELECT * FROM jobs WHERE id = $1 AND account_id = $2`,
        [job_id, req.accountId]
      );
      const job = jobRes.rows[0];
      if (!job) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Job not found' });
      }
      if (job.status !== 'complete') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Job must be complete before invoicing' });
      }
      const dupRes = await client.query(
        `SELECT id FROM invoices WHERE job_id = $1 AND account_id = $2`,
        [job_id, req.accountId]
      );
      if (dupRes.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'An invoice already exists for this job' });
      }
      finalClientId = job.client_id;
      finalJobId    = job_id;
      baseLineItems = Array.isArray(reqLineItems) && reqLineItems.length > 0
        ? reqLineItems
        : [{
            name:       job.service_type || 'Service',
            description:'',
            quantity:   1,
            unit_price: parseFloat(job.amount || 0),
            taxable:    taxRate > 0,
          }];

    } else if (source_type === 'ESTIMATE') {
      if (!source_estimate_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'source_estimate_id is required for ESTIMATE source' });
      }
      const estRes = await client.query(
        `SELECT * FROM estimates WHERE id = $1 AND account_id = $2`,
        [source_estimate_id, req.accountId]
      );
      const est = estRes.rows[0];
      if (!est) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Estimate not found' });
      }
      if (est.status !== 'signed') {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'Only signed estimates can be converted to invoices' });
      }
      if (est.converted_invoice_id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This estimate has already been invoiced' });
      }
      finalClientId         = est.client_id;
      finalSourceEstimateId = source_estimate_id;
      if (!finalSubject) finalSubject = est.title || null;
      if (!finalClientMessage && est.notes) finalClientMessage = est.notes;
      const estItems = Array.isArray(est.line_items) ? est.line_items : [];
      baseLineItems = (Array.isArray(reqLineItems) && reqLineItems.length > 0)
        ? reqLineItems
        : estItems.map(item => ({
            name:        item.description || item.name || 'Service',
            description: '',
            quantity:    parseFloat(item.quantity) || 1,
            unit_price:  parseFloat(item.unit_price ?? item.amount) || 0,
            taxable:     true,
          }));

    } else if (source_type === 'AGREEMENT') {
      if (!source_agreement_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'source_agreement_id is required for AGREEMENT source' });
      }
      if (!period_start || !period_end) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'period_start and period_end are required for AGREEMENT source' });
      }
      const agrRes = await client.query(
        `SELECT a.*, c.name AS client_name FROM recurring_agreements a
         JOIN clients c ON c.id = a.client_id
         WHERE a.id = $1 AND a.account_id = $2`,
        [source_agreement_id, req.accountId]
      );
      const agr = agrRes.rows[0];
      if (!agr) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Agreement not found' });
      }
      if (agr.status !== 'active') {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'Only active agreements can be invoiced' });
      }
      const dupRes = await client.query(
        `SELECT id FROM agreement_invoice_periods
         WHERE agreement_id = $1 AND period_start = $2 AND period_end = $3`,
        [source_agreement_id, period_start, period_end]
      );
      if (dupRes.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This billing period has already been invoiced' });
      }
      finalClientId          = agr.client_id;
      finalSourceAgreementId = source_agreement_id;
      finalPeriodStart       = period_start;
      finalPeriodEnd         = period_end;
      if (!finalSubject) finalSubject = `${agr.name} — ${fmtPeriod(period_start, period_end)}`;
      const agrItems = Array.isArray(agr.line_items) ? agr.line_items : [];
      baseLineItems = agrItems.length > 0
        ? agrItems.map(item => ({
            name:        item.description || item.name || agr.name || 'Service',
            description: '',
            quantity:    parseFloat(item.quantity) || 1,
            unit_price:  parseFloat(item.unit_price ?? item.amount) || 0,
            taxable:     true,
          }))
        : [{
            name:        agr.name || 'Recurring Service',
            description: `Coverage: ${fmtPeriod(period_start, period_end)}`,
            quantity:    1,
            unit_price:  parseFloat(agr.plan_price) || 0,
            taxable:     true,
          }];

    } else {
      if (!bodyClientId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'client_id is required for MANUAL invoice' });
      }
      const clientRes = await client.query(
        `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
        [bodyClientId, req.accountId]
      );
      if (!clientRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Client not found' });
      }
      finalClientId = bodyClientId;
      baseLineItems = Array.isArray(reqLineItems) ? reqLineItems : [];
    }

    if (baseLineItems.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'At least one line item is required' });
    }

    const { validItems, subtotal, discountAmount, taxAmount, total } =
      computeTotals(baseLineItems, discount_type, discount_value, taxRate);

    // Atomically claim the next invoice number for this account.
    // next_val stores the NEXT available number (pre-incremented sentinel).
    // Seed priority: existing MAX(invoice_number) → configured starting_number → 0.
    // Subsequent creates just increment next_val; the seed path never re-runs.
    const numRes = await client.query(
      `WITH seed AS (
         SELECT COALESCE(
           (SELECT MAX(inv.invoice_number) + 1
              FROM invoices inv
             WHERE inv.account_id = $1 AND inv.invoice_number IS NOT NULL),
           COALESCE(
             (SELECT invoice_starting_number FROM booking_settings WHERE account_id = $1),
             0
           )
         ) AS first_val,
         COALESCE(
           (SELECT invoice_starting_number FROM booking_settings WHERE account_id = $1),
           0
         ) AS cfg_start
       )
       INSERT INTO invoice_number_sequences (account_id, next_val, starting_number)
       SELECT $1,
              (SELECT first_val FROM seed) + 1,
              (SELECT cfg_start FROM seed)
       ON CONFLICT (account_id) DO UPDATE
         SET next_val = invoice_number_sequences.next_val + 1
       RETURNING next_val - 1 AS invoice_number`,
      [req.accountId]
    );
    const invoiceNumber = numRes.rows[0].invoice_number;

    const finalIssuedDate = issued_date || new Date().toISOString().slice(0, 10);
    const finalDueDate    = due_date
      || (payment_terms !== 'due_on_receipt' && payment_terms !== 'custom'
          ? computeDueDate(payment_terms, finalIssuedDate)
          : null);

    const { rows } = await client.query(
      `INSERT INTO invoices (
         account_id, job_id, client_id, source_type, source_estimate_id, source_agreement_id,
         invoice_number,
         amount, tax_amount, subtotal, discount_type, discount_value, discount_amount, discount_label,
         line_items, subject, issued_date, payment_terms, due_date,
         client_message, internal_notes, terms, payment_options, status, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,
         $7,
         $8,$9,$10,$11,$12,$13,$14,
         $15,$16,$17,$18,$19,
         $20,$21,$22,$23,$24,$25
       ) RETURNING *`,
      [
        req.accountId, finalJobId, finalClientId, source_type, finalSourceEstimateId, finalSourceAgreementId,
        invoiceNumber,
        total, taxAmount, subtotal,
        discount_type || null, parseFloat(discount_value) || null, discountAmount || null, discount_label || null,
        JSON.stringify(validItems), finalSubject, finalIssuedDate, payment_terms, finalDueDate,
        finalClientMessage, internal_notes || null, terms || null,
        payment_options ? JSON.stringify(payment_options) : '{}',
        status, req.userId,
      ]
    );

    if (source_type === 'ESTIMATE') {
      await client.query(
        `UPDATE estimates SET converted_invoice_id = $1 WHERE id = $2 AND account_id = $3`,
        [rows[0].id, finalSourceEstimateId, req.accountId]
      );
    }

    if (source_type === 'AGREEMENT') {
      await client.query(
        `INSERT INTO agreement_invoice_periods
           (account_id, agreement_id, invoice_id, period_start, period_end)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.accountId, finalSourceAgreementId, rows[0].id, finalPeriodStart, finalPeriodEnd]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An invoice already exists for this job' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── GET /api/invoices/next-number ───────────────────────────────────────────
// Lightweight preview — returns the next invoice number without allocating it.
// Chain: live sequence → max-existing+1 → configured start → null (no fallback 1001).
router.get('/next-number', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(
         (SELECT next_val FROM invoice_number_sequences WHERE account_id = $1),
         (SELECT MAX(invoice_number) + 1 FROM invoices
           WHERE account_id = $1 AND invoice_number IS NOT NULL),
         (SELECT invoice_starting_number FROM booking_settings WHERE account_id = $1)
       ) AS next_number`,
      [req.accountId]
    );
    const n = rows[0]?.next_number;
    res.json({ next_number: n != null ? parseInt(n, 10) : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices/settings ──────────────────────────────────────────────
router.get('/settings', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const [numRes, bkRes] = await Promise.all([
      pool.query(
        // Chain: live sequence → max existing+1 → configured start → null.
        // No hardcoded 1001 fallback; value is always authoritative.
        `SELECT COALESCE(
           (SELECT next_val FROM invoice_number_sequences WHERE account_id = $1),
           (SELECT MAX(invoice_number) + 1 FROM invoices
             WHERE account_id = $1 AND invoice_number IS NOT NULL),
           (SELECT invoice_starting_number FROM booking_settings WHERE account_id = $1)
         ) AS next_number`,
        [req.accountId]
      ),
      pool.query(
        `SELECT COALESCE(tax_rate, 0)                    AS tax_rate,
                COALESCE(accept_card, TRUE)               AS accept_card,
                COALESCE(accept_ach, FALSE)               AS accept_ach,
                COALESCE(allow_partial_payments, FALSE)   AS allow_partial_payments,
                COALESCE(invoice_starting_number, 0)      AS invoice_starting_number,
                default_terms
         FROM booking_settings
         WHERE account_id = $1`,
        [req.accountId]
      ),
    ]);
    const bs = bkRes.rows[0] || {};
    res.json({
      next_number:             numRes.rows[0]?.next_number ?? null,
      invoice_starting_number: bs.invoice_starting_number != null ? parseInt(bs.invoice_starting_number, 10) : 0,
      tax_rate:                parseFloat(bs.tax_rate || 0),
      accept_card:             bs.accept_card !== false,
      accept_ach:              !!bs.accept_ach,
      allow_partial_payments:  !!bs.allow_partial_payments,
      default_terms:           bs.default_terms || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices ────────────────────────────────────────────────────────
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const {
      search      = '',
      status      = 'all',
      sort        = 'created_at',
      order       = 'DESC',
      page        = '1',
      pageSize    = '50',
      start       = '',
      end         = '',
      balanceGt0  = '',
      balanceEq0  = '',
      balanceMin  = '',
      balanceMax  = '',
      client_id   = '',
      source      = '',
      amount_min  = '',
      amount_max  = '',
      due_start   = '',
      due_end     = '',
      service     = '',
    } = req.query;

    const ALLOWED_SORTS = {
      client:         'c.name',
      invoice_number: 'COALESCE(i.invoice_number, 0)',
      due_date:       'i.due_date',
      status:         'i.status',
      amount:         'i.amount',
      balance:        `CASE WHEN i.status IN ('pending','failed') THEN i.amount::numeric WHEN i.status = 'paid' THEN 0 ELSE NULL END`,
      created_at:     'i.created_at',
    };
    const sortCol = ALLOWED_SORTS[sort] || ALLOWED_SORTS.created_at;
    const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const pg      = Math.max(1, parseInt(page, 10) || 1);
    const ps      = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
    const offset  = (pg - 1) * ps;

    const kpiRes = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0)                                                             AS outstanding,
         COALESCE(SUM(CASE WHEN status = 'paid'    THEN amount ELSE 0 END), 0)                                                             AS collected,
         COALESCE(SUM(CASE WHEN status IN ('pending','failed') AND due_date IS NOT NULL AND due_date < NOW() THEN amount ELSE 0 END), 0)    AS past_due,
         COUNT(CASE WHEN status IN ('pending','failed') AND due_date IS NOT NULL AND due_date < NOW() THEN 1 END)::int                      AS past_due_count,
         COUNT(*)::int                                                                                                                      AS total_count,
         COUNT(CASE WHEN status = 'pending' THEN 1 END)::int                                                                               AS count_pending,
         COUNT(CASE WHEN status = 'paid'    THEN 1 END)::int                                                                               AS count_paid,
         COUNT(CASE WHEN status = 'void'    THEN 1 END)::int                                                                               AS count_void,
         COUNT(CASE WHEN status = 'draft'   THEN 1 END)::int                                                                               AS count_draft,
         COUNT(CASE WHEN status != 'void'   THEN 1 END)::int                                                                               AS issued_count,
         COALESCE(SUM(CASE WHEN status != 'void' THEN amount ELSE 0 END), 0)                                                               AS issued_total
       FROM invoices
       WHERE account_id = $1`,
      [req.accountId]
    );
    const k = kpiRes.rows[0];
    const issuedCount = k.issued_count;
    const issuedTotal = parseFloat(k.issued_total);
    const kpis = {
      outstanding:    parseFloat(k.outstanding),
      collected:      parseFloat(k.collected),
      pastDue:        parseFloat(k.past_due),
      pastDueCount:   k.past_due_count,
      totalCount:     k.total_count,
      issuedCount,
      issuedTotal,
      averageInvoice: issuedCount > 0 ? issuedTotal / issuedCount : 0,
      counts: {
        all:      k.total_count,
        pending:  k.count_pending,
        paid:     k.count_paid,
        void:     k.count_void,
        draft:    k.count_draft,
        past_due: k.past_due_count,
      },
    };

    const listParams = [req.accountId];
    const conditions = [];

    if (status === 'past_due') {
      conditions.push(`(i.status IN ('pending','failed') AND i.due_date IS NOT NULL AND i.due_date < NOW())`);
    } else if (status !== 'all') {
      listParams.push(status);
      conditions.push(`i.status = $${listParams.length}`);
    }

    if (start) {
      listParams.push(start);
      conditions.push(`i.created_at::date >= $${listParams.length}::date`);
    }
    if (end) {
      listParams.push(end);
      conditions.push(`i.created_at::date <= $${listParams.length}::date`);
    }
    if (balanceGt0 === 'true') {
      conditions.push(`(i.status IN ('pending','failed') AND i.amount > 0)`);
    }
    if (balanceEq0 === 'true') {
      conditions.push(`i.status = 'paid'`);
    }
    if (balanceMin !== '') {
      const bMin = parseFloat(balanceMin);
      if (!isNaN(bMin)) {
        listParams.push(bMin);
        conditions.push(`(i.status IN ('pending','failed') AND i.amount::numeric >= $${listParams.length})`);
      }
    }
    if (balanceMax !== '') {
      const bMax = parseFloat(balanceMax);
      if (!isNaN(bMax)) {
        listParams.push(bMax);
        conditions.push(`(i.status IN ('pending','failed') AND i.amount::numeric <= $${listParams.length})`);
      }
    }

    if (client_id) {
      listParams.push(client_id);
      conditions.push(`i.client_id = $${listParams.length}`);
    }

    if (source && source !== 'all') {
      const SRC_MAP = { recurring: 'AGREEMENT', job: 'JOB', estimate: 'ESTIMATE', agreement: 'AGREEMENT', blank: 'MANUAL', manual: 'MANUAL' };
      const mapped = SRC_MAP[source.toLowerCase()] || source.toUpperCase();
      if (['JOB','MANUAL','ESTIMATE','AGREEMENT'].includes(mapped)) {
        listParams.push(mapped);
        conditions.push(`i.source_type = $${listParams.length}`);
      }
    }

    if (amount_min !== '') {
      const aMin = parseFloat(amount_min);
      if (!isNaN(aMin)) {
        listParams.push(aMin);
        conditions.push(`i.amount::numeric >= $${listParams.length}`);
      }
    }
    if (amount_max !== '') {
      const aMax = parseFloat(amount_max);
      if (!isNaN(aMax)) {
        listParams.push(aMax);
        conditions.push(`i.amount::numeric <= $${listParams.length}`);
      }
    }

    if (due_start) {
      listParams.push(due_start);
      conditions.push(`i.due_date >= $${listParams.length}::date`);
    }
    if (due_end) {
      listParams.push(due_end);
      conditions.push(`i.due_date <= $${listParams.length}::date`);
    }

    if (service.trim()) {
      listParams.push(`%${service.trim()}%`);
      conditions.push(`COALESCE(j.service_type,'') ILIKE $${listParams.length}`);
    }

    const term = search.trim();
    if (term) {
      listParams.push(`%${term}%`);
      const p = listParams.length;
      conditions.push(`(
        c.name                ILIKE $${p}
        OR c.email            ILIKE $${p}
        OR c.phone            ILIKE $${p}
        OR c.address          ILIKE $${p}
        OR COALESCE(j.service_type, '') ILIKE $${p}
        OR COALESCE(i.invoice_number::text, UPPER(LEFT(i.id::text, 8))) ILIKE $${p}
        OR i.amount::text     ILIKE $${p}
        OR COALESCE(i.subject,'') ILIKE $${p}
      )`);
    }

    const whereExtra = conditions.length ? ' AND ' + conditions.join(' AND ') : '';
    const joins = `
      FROM invoices i
      JOIN clients c ON c.id = i.client_id
      LEFT JOIN jobs j ON j.id = i.job_id
      WHERE i.account_id = $1${whereExtra}`;

    const countParams = [...listParams];
    const rowParams   = [...listParams, ps, offset];

    const [countRes, rowsRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total ${joins}`, countParams),
      pool.query(
        `SELECT
           i.*,
           COALESCE(i.invoice_number::text, UPPER(LEFT(i.id::text, 8))) AS invoice_number,
           CASE
             WHEN i.status IN ('pending','failed') THEN i.amount
             WHEN i.status = 'paid'                THEN 0
             ELSE NULL
           END                          AS balance,
           (i.status IN ('pending','failed') AND i.due_date IS NOT NULL AND i.due_date < NOW()) AS is_past_due,
           c.name    AS client_name,
           c.email   AS client_email,
           c.phone   AS client_phone,
           c.address AS client_address,
           j.service_type
         ${joins}
         ORDER BY ${sortCol} ${sortDir} NULLS LAST
         LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}`,
        rowParams
      ),
    ]);

    res.json({ rows: rowsRes.rows, total: countRes.rows[0].total, page: pg, pageSize: ps, kpis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices/eligible-jobs ─────────────────────────────────────────
router.get('/eligible-jobs', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { search = '', client_id = '' } = req.query;
    const params = [req.accountId];
    const conds  = [];

    if (client_id) {
      params.push(client_id);
      conds.push(`j.client_id = $${params.length}`);
    }

    const term = search.trim();
    if (term) {
      params.push(`%${term}%`);
      const p = params.length;
      conds.push(`(c.name ILIKE $${p} OR j.service_type ILIKE $${p} OR j.service_address ILIKE $${p})`);
    }

    const whereExtra = conds.length ? ' AND ' + conds.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT j.id, j.service_type, j.amount, j.scheduled_at, j.service_address AS address,
              j.client_id,
              c.name AS client_name, c.email AS client_email
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       WHERE j.account_id = $1
         AND j.status = 'complete'
         AND NOT EXISTS (
           SELECT 1 FROM invoices inv
           WHERE inv.job_id = j.id AND inv.account_id = $1
         )${whereExtra}
       ORDER BY j.scheduled_at DESC
       LIMIT 100`,
      params
    );

    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices/eligible-estimates ────────────────────────────────────
router.get('/eligible-estimates', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { q = '' } = req.query;
    const params = [req.accountId];
    const conds  = [`e.status = 'signed'`, `e.converted_invoice_id IS NULL`];

    const term = q.trim();
    if (term) {
      params.push(`%${term}%`);
      const p = params.length;
      conds.push(
        `(c.name ILIKE $${p} OR c.email ILIKE $${p} OR e.title ILIKE $${p} OR e.amount::text ILIKE $${p})`
      );
    }

    const { rows } = await pool.query(
      `SELECT e.id, e.title, e.amount, e.tax_amount, e.status, e.notes,
              e.line_items, e.created_at, e.signed_at, e.converted_invoice_id,
              c.id AS client_id, c.name AS client_name,
              c.email AS client_email, c.address AS client_address
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       WHERE e.account_id = $1
         AND ${conds.join(' AND ')}
       ORDER BY e.signed_at DESC NULLS LAST, e.created_at DESC
       LIMIT 50`,
      params
    );

    res.json(rows);
  } catch (err) {
    // If converted_invoice_id column doesn't exist yet (migration race), return empty safely
    if (err.message && err.message.includes('converted_invoice_id')) {
      return res.json([]);
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices/eligible-agreements ────────────────────────────────────
router.get('/eligible-agreements', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { q = '', client_id = '' } = req.query;
    const params = [req.accountId];
    const conds  = [`a.status = 'active'`];

    if (client_id.trim()) {
      params.push(client_id.trim());
      conds.push(`a.client_id = $${params.length}`);
    }

    const term = q.trim();
    if (term) {
      params.push(`%${term}%`);
      const p = params.length;
      conds.push(
        `(c.name ILIKE $${p} OR a.name ILIKE $${p} OR a.service_type ILIKE $${p} OR a.service_address ILIKE $${p})`
      );
    }

    const { rows } = await pool.query(
      `SELECT a.id, a.name, a.service_type, a.service_address,
              a.cadence, a.billing_cadence, a.billing_trigger, a.billing_day,
              a.included_services_per_period, a.extra_occurrence_policy, a.service_interval_days,
              a.plan_price, a.status, a.payment_status,
              a.notes, a.line_items, a.started_at, a.next_billing_date,
              c.id AS client_id, c.name AS client_name,
              c.email AS client_email, c.address AS client_address
       FROM recurring_agreements a
       JOIN clients c ON c.id = a.client_id
       WHERE a.account_id = $1
         AND ${conds.join(' AND ')}
       ORDER BY c.name ASC, a.name ASC
       LIMIT 100`,
      params
    );

    // Resolve current billing period and check if already invoiced for each agreement
    const enriched = await Promise.all(rows.map(async agr => {
      const startedAtStr = agr.started_at ? agr.started_at.toISOString().slice(0, 10) : null;
      const { period_start, period_end } = currentBillingPeriod(
        agr.cadence, startedAtStr, agr.service_interval_days
      );
      const dup = await pool.query(
        `SELECT id FROM agreement_invoice_periods
         WHERE agreement_id = $1 AND period_start = $2 AND period_end = $3`,
        [agr.id, period_start, period_end]
      );
      return {
        ...agr,
        period_start,
        period_end,
        period_already_invoiced: dup.rows.length > 0,
      };
    }));

    res.json(enriched);
  } catch (err) {
    // If tables don't exist yet (migration race), return empty safely
    if (err.message && (err.message.includes('recurring_agreements') || err.message.includes('agreement_invoice_periods'))) {
      return res.json([]);
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices/:id ────────────────────────────────────────────────────
router.get('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*,
              COALESCE(i.invoice_number::text, UPPER(LEFT(i.id::text, 8))) AS invoice_number_display,
              c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
              c.address AS client_address, c.city AS client_city, c.state AS client_state,
              c.zip AS client_zip, c.stripe_payment_method_id, c.card_on_file,
              j.service_type, j.scheduled_at, j.tech_id
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/invoices/:id/line-items ──────────────────────────────────────
router.patch('/:id/line-items', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { line_items } = req.body;
  if (!Array.isArray(line_items) || line_items.length === 0) {
    return res.status(400).json({ error: 'line_items must be a non-empty array' });
  }
  try {
    const [invoiceRes, settingsRes] = await Promise.all([
      pool.query(`SELECT * FROM invoices WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]),
      pool.query(`SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]),
    ]);
    const invoice = invoiceRes.rows[0];
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    if (!['pending', 'draft'].includes(invoice.status)) {
      return res.status(400).json({ error: 'Can only edit line items on draft or pending invoices' });
    }

    const taxRate = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
    const { validItems, subtotal, discountAmount, taxAmount, total } =
      computeTotals(line_items, invoice.discount_type, invoice.discount_value, taxRate);

    const { rows } = await pool.query(
      `UPDATE invoices
       SET line_items = $1, amount = $2, tax_amount = $3, subtotal = $4,
           updated_by = $5, updated_at = NOW()
       WHERE id = $6 AND account_id = $7 RETURNING *`,
      [JSON.stringify(validItems), total, taxAmount, subtotal, req.userId, req.params.id, req.accountId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/invoices/:id/send ─────────────────────────────────────────────
router.post('/:id/send', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email,
              COALESCE(j.service_type, i.subject, 'Service') AS service_type,
              a.name AS business_name,
              COALESCE(i.tax_amount, 0) AS tax_amount
       FROM invoices i
       JOIN clients  c ON c.id = i.client_id
       LEFT JOIN jobs j ON j.id = i.job_id
       JOIN accounts a ON a.id = i.account_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [req.params.id, req.accountId]
    );
    const inv = rows[0];
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (!['pending', 'draft'].includes(inv.status)) {
      return res.status(400).json({ error: 'Invoice is not in a sendable state.' });
    }

    const appUrl  = process.env.APP_URL || 'http://localhost:5173';
    const payLink = `${appUrl}/pay/${inv.id}`;

    await pool.query(
      `UPDATE invoices SET payment_link = $1, sent_at = NOW(), status = 'pending' WHERE id = $2`,
      [payLink, inv.id]
    );

    if (inv.client_email) {
      generateInvoicePdfBuffer({ ...inv, payment_link: payLink }).then(pdfBuf => {
        email.send({
          to:      inv.client_email,
          subject: `Invoice from ${inv.business_name} — $${parseFloat(inv.amount).toFixed(2)}`,
          html:    email.invoiceHtml(inv.client_name, inv.service_type, inv.amount, payLink, inv.business_name, inv.tax_amount),
          attachments: [{
            filename:    `invoice-${inv.invoice_number || inv.id.slice(0, 8)}.pdf`,
            content:     pdfBuf,
            contentType: 'application/pdf',
          }],
        });
      }).catch(err => console.error('[Invoice PDF]', err.message));
    }

    notify.create(req.accountId, 'invoice_sent',
      `Invoice sent to ${inv.client_name}`,
      `$${parseFloat(inv.amount).toFixed(2)} for ${inv.service_type}`,
      '/invoices'
    );

    res.json({ success: true, payment_link: payLink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices/:id/pdf ────────────────────────────────────────────────
router.get('/:id/pdf', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email,
              COALESCE(j.service_type, i.subject, 'Service') AS service_type,
              a.name AS business_name
       FROM invoices i
       JOIN clients  c ON c.id = i.client_id
       LEFT JOIN jobs j ON j.id = i.job_id
       JOIN accounts a ON a.id = i.account_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const pdfBuf = await generateInvoicePdfBuffer(rows[0]);
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${rows[0].invoice_number || rows[0].id.slice(0, 8)}.pdf"`,
    });
    res.send(pdfBuf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/invoices/:id/void ────────────────────────────────────────────
router.patch('/:id/void', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE invoices SET status = 'void', updated_by = $1, updated_at = NOW()
       WHERE id = $2 AND account_id = $3 RETURNING *`,
      [req.userId, req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/invoices/:id/payments — record manual payment ─────────────────
router.post('/:id/payments', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const VALID_METHODS = ['cash', 'check', 'other'];
  const { amount, date, method, reference = '', note = '' } = req.body;

  if (!method || !VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` });
  }
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM invoices WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });
    const inv = rows[0];

    if (inv.status === 'void') {
      return res.status(400).json({ error: 'Cannot record payment on a void invoice' });
    }
    if (inv.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already paid' });
    }

    const paymentDate = date || new Date().toISOString().slice(0, 10);
    const combinedNote = [reference ? `Ref: ${reference}` : null, note || null].filter(Boolean).join(' — ') || null;

    const { rows: updated } = await pool.query(
      `UPDATE invoices
       SET status = 'paid', paid_at = $1, paid_method = $2, payment_note = $3
       WHERE id = $4 AND account_id = $5
       RETURNING *`,
      [paymentDate, method, combinedNote, req.params.id, req.accountId]
    );

    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
