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

    // Header
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#1C2333').text('FIELDCORE', { align: 'left' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(11).fillColor('#6b7280').text(inv.business_name || 'FieldCore');
    doc.moveDown(1.5);

    // Invoice title + meta
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1C2333').text('INVOICE');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280');
    doc.text(`Invoice #: ${inv.id.slice(0, 8).toUpperCase()}`);
    doc.text(`Date: ${fmtDt(inv.created_at)}`);
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
      doc.text(item.description || 'Service', 50, y, { width: 360 });
      doc.text(fmtAmt(item.amount), 410, y, { width: 100, align: 'right' });
      doc.moveDown(0.6);
    });
    doc.moveDown(0.4);

    // Totals
    doc.moveTo(360, doc.y).lineTo(560, doc.y).strokeColor('#e5e0d8').stroke();
    doc.moveDown(0.5);
    if (tax > 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280');
      doc.text('Subtotal', 360, doc.y, { width: 100 });
      doc.text(fmtAmt(pretax), 460, doc.y - doc.currentLineHeight(), { width: 100, align: 'right' });
      doc.moveDown(0.5);
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

    // Footer
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(560, doc.y).strokeColor('#e5e0d8').stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor('#9ca3af')
       .text('Thank you for your business.', { align: 'center' });

    doc.end();
  });
}

// POST /api/invoices — generate invoice from completed job
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { job_id } = req.body;
  if (!job_id) return res.status(400).json({ error: 'job_id is required' });

  try {
    const [jobResult, settingsResult] = await Promise.all([
      pool.query(`SELECT * FROM jobs WHERE id = $1 AND account_id = $2`, [job_id, req.accountId]),
      pool.query(`SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]),
    ]);
    const job = jobResult.rows[0];
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'complete') {
      return res.status(400).json({ error: 'Job must be complete before invoicing' });
    }

    const taxRate     = parseFloat(settingsResult.rows[0]?.tax_rate || 0);
    const reqItems    = Array.isArray(req.body.line_items) ? req.body.line_items : null;
    const lineItems   = reqItems || [{ description: job.service_type || 'Service', amount: parseFloat(job.amount || 0) }];
    const subtotal    = lineItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const taxAmount   = subtotal > 0 ? parseFloat((subtotal * taxRate).toFixed(2)) : 0;
    const total       = parseFloat((subtotal + taxAmount).toFixed(2));

    const { rows } = await pool.query(
      `INSERT INTO invoices (account_id, job_id, client_id, amount, tax_amount, line_items)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.accountId, job_id, job.client_id, total, taxAmount, JSON.stringify(lineItems)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, c.name AS client_name
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       WHERE i.account_id = $1
       ORDER BY i.created_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/:id
router.get('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
              c.stripe_payment_method_id, c.card_on_file,
              j.service_type, j.scheduled_at, j.tech_id
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       JOIN jobs j ON j.id = i.job_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/invoices/:id/line-items — update line items on a pending invoice
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
    if (invoice.status !== 'pending') return res.status(400).json({ error: 'Can only edit line items on pending invoices' });

    const taxRate   = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
    const subtotal  = line_items.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const taxAmount = subtotal > 0 ? parseFloat((subtotal * taxRate).toFixed(2)) : 0;
    const total     = parseFloat((subtotal + taxAmount).toFixed(2));

    const { rows } = await pool.query(
      `UPDATE invoices SET line_items = $1, amount = $2, tax_amount = $3 WHERE id = $4 AND account_id = $5 RETURNING *`,
      [JSON.stringify(line_items), total, taxAmount, req.params.id, req.accountId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoices/:id/send — email payment link to client + mark sent
router.post('/:id/send', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email,
              j.service_type, a.name AS business_name,
              COALESCE(i.tax_amount, 0) AS tax_amount
       FROM invoices i
       JOIN clients  c ON c.id = i.client_id
       JOIN jobs     j ON j.id = i.job_id
       JOIN accounts a ON a.id = i.account_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [req.params.id, req.accountId]
    );
    const inv = rows[0];
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (inv.status !== 'pending') return res.status(400).json({ error: 'Invoice is not pending.' });

    const appUrl  = process.env.APP_URL || 'http://localhost:5173';
    const payLink = `${appUrl}/pay/${inv.id}`;

    await pool.query(
      `UPDATE invoices SET payment_link = $1, sent_at = NOW() WHERE id = $2`,
      [payLink, inv.id]
    );

    if (inv.client_email) {
      generateInvoicePdfBuffer({ ...inv, payment_link: payLink }).then(pdfBuf => {
        email.send({
          to:      inv.client_email,
          subject: `Invoice from ${inv.business_name} — $${parseFloat(inv.amount).toFixed(2)}`,
          html:    email.invoiceHtml(inv.client_name, inv.service_type, inv.amount, payLink, inv.business_name, inv.tax_amount),
          attachments: [{
            filename:    `invoice-${inv.id.slice(0, 8)}.pdf`,
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

// GET /api/invoices/:id/pdf — download invoice as PDF
router.get('/:id/pdf', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email,
              j.service_type, a.name AS business_name
       FROM invoices i
       JOIN clients  c ON c.id = i.client_id
       JOIN jobs     j ON j.id = i.job_id
       JOIN accounts a ON a.id = i.account_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const pdfBuf = await generateInvoicePdfBuffer(rows[0]);
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${rows[0].id.slice(0, 8)}.pdf"`,
    });
    res.send(pdfBuf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/invoices/:id/void
router.patch('/:id/void', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE invoices SET status = 'void' WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
