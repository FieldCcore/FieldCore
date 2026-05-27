import { getPool } from '../../../_lib.js';
import { requirePortalAuth } from '../../../_portal_lib.js';
import { escHtml } from '../../../_email.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const portalUser = requirePortalAuth(req, res);
  if (!portalUser) return;

  const { clientId, accountId } = portalUser;
  const { id } = req.query;
  const pool = getPool();

  try {
    const r = await pool.query(`
      SELECT i.id, i.amount, i.status, i.paid_at, i.created_at, i.tax_amount,
             j.service_type, j.scheduled_at, j.notes,
             c.name AS client_name, c.email AS client_email, c.address AS client_address,
             a.name AS business_name,
             bp.phone AS business_phone, bp.address AS business_address,
             bp.city, bp.state, bp.zip
      FROM invoices i
      JOIN jobs j ON j.id = i.job_id
      JOIN clients c ON c.id = i.client_id
      JOIN accounts a ON a.id = i.account_id
      LEFT JOIN business_profiles bp ON bp.account_id = i.account_id
      WHERE i.id = $1 AND i.client_id = $2 AND i.account_id = $3
    `, [id, clientId, accountId]);

    if (!r.rows.length) return res.status(404).json({ error: 'Invoice not found.' });
    const inv = r.rows[0];

    const subtotal = parseFloat(inv.amount) - parseFloat(inv.tax_amount || 0);
    const tax      = parseFloat(inv.tax_amount || 0);
    const total    = parseFloat(inv.amount);
    const fmt$     = n => `$${n.toFixed(2)}`;
    const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Receipt · ${escHtml(inv.service_type)} · ${fmtDate(inv.paid_at || inv.created_at)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: white; color: #1C2333; max-width: 600px; margin: 48px auto; padding: 0 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #1C2333; margin-bottom: 28px; }
  .logo { font-weight: 800; font-size: 20px; letter-spacing: .08em; color: #1C2333; }
  .logo sup { font-size: 10px; }
  .badge { padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; background: ${inv.status === 'paid' ? '#DCFCE7' : '#FEF3C7'}; color: ${inv.status === 'paid' ? '#15803D' : '#B45309'}; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
  .party-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: #8A90A2; margin-bottom: 6px; }
  .party-name { font-size: 15px; font-weight: 700; color: #1C2333; margin-bottom: 2px; }
  .party-detail { font-size: 13px; color: #5F667A; line-height: 1.6; }
  .items { border: 1px solid #E6E6E6; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
  .item-row { display: flex; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #E6E6E6; font-size: 14px; }
  .item-row:last-child { border-bottom: none; }
  .totals { border: 1px solid #E6E6E6; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
  .total-row { display: flex; justify-content: space-between; padding: 11px 16px; font-size: 14px; border-bottom: 1px solid #E6E6E6; }
  .total-row:last-child { border-bottom: none; background: #1C2333; color: white; font-weight: 700; font-size: 15px; border-radius: 0 0 8px 8px; }
  .footer { text-align: center; font-size: 12px; color: #8A90A2; border-top: 1px solid #E6E6E6; padding-top: 20px; }
  @media print { body { margin: 0; } button { display: none; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">FIELDCORE<sup>™</sup></div>
    <div style="font-size:12px;color:#8A90A2;margin-top:4px">Payment Receipt</div>
  </div>
  <div style="text-align:right">
    <span class="badge">${escHtml(inv.status.toUpperCase())}</span>
    <div style="font-size:12px;color:#8A90A2;margin-top:6px">Invoice #${inv.id.slice(-8).toUpperCase()}</div>
    <div style="font-size:12px;color:#8A90A2">${fmtDate(inv.paid_at || inv.created_at)}</div>
  </div>
</div>

<div class="parties">
  <div>
    <div class="party-label">Billed From</div>
    <div class="party-name">${escHtml(inv.business_name)}</div>
    <div class="party-detail">
      ${inv.business_address ? escHtml(inv.business_address) + '<br>' : ''}
      ${inv.city ? escHtml(inv.city) + ', ' + escHtml(inv.state || '') + ' ' + escHtml(inv.zip || '') + '<br>' : ''}
      ${inv.business_phone ? escHtml(inv.business_phone) : ''}
    </div>
  </div>
  <div>
    <div class="party-label">Billed To</div>
    <div class="party-name">${escHtml(inv.client_name)}</div>
    <div class="party-detail">
      ${inv.client_email ? escHtml(inv.client_email) + '<br>' : ''}
      ${inv.client_address ? escHtml(inv.client_address) : ''}
    </div>
  </div>
</div>

<div class="items">
  <div class="item-row" style="background:#F8F7F5;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em;">
    <span style="color:#8A90A2">Service</span><span style="color:#8A90A2">Amount</span>
  </div>
  <div class="item-row">
    <div>
      <div style="font-weight:600">${escHtml(inv.service_type)}</div>
      ${inv.scheduled_at ? `<div style="font-size:12px;color:#5F667A;margin-top:2px">${fmtDate(inv.scheduled_at)}</div>` : ''}
      ${inv.notes ? `<div style="font-size:12px;color:#5F667A;margin-top:2px">${escHtml(inv.notes)}</div>` : ''}
    </div>
    <div style="font-weight:600">${fmt$(subtotal)}</div>
  </div>
</div>

<div class="totals">
  <div class="total-row"><span>Subtotal</span><span>${fmt$(subtotal)}</span></div>
  ${tax > 0 ? `<div class="total-row"><span>Tax</span><span>${fmt$(tax)}</span></div>` : ''}
  <div class="total-row"><span>Total</span><span>${fmt$(total)}</span></div>
</div>

${inv.status === 'paid' ? `<div style="background:#F0FDF4;border:1px solid rgba(21,128,61,.2);border-radius:8px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#15803D;font-weight:600">✓ Payment received ${fmtDate(inv.paid_at)}</div>` : ''}

<div style="text-align:center;margin-bottom:24px">
  <button onclick="window.print()" style="padding:10px 24px;background:#1C2333;color:#D6B58A;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Print / Save as PDF</button>
</div>

<div class="footer">
  Receipt generated by FieldCore · getfieldcore.com<br>
  Questions? Contact ${escHtml(inv.business_name)} or support@getfieldcore.com
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('[portal/receipt]', err);
    res.status(500).json({ error: 'Failed to generate receipt.' });
  }
}
