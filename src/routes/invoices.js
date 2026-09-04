const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const email  = require('../services/email');
const notify = require('../services/notify');
const PDFDoc = require('pdfkit');
const https  = require('https');
const http   = require('http');

function fetchLogoBuffer(url) {
  return new Promise(resolve => {
    try {
      const proto = url.startsWith('https') ? https : http;
      const req = proto.get(url, { timeout: 5000 }, res => {
        if (res.statusCode !== 200) return resolve(null);
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end',  () => resolve(Buffer.concat(chunks)));
      });
      req.on('error',   () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch (_) { resolve(null); }
  });
}

async function generateInvoicePdfBuffer(inv) {
  const NAVY  = '#1C2333';
  const SLATE = '#5F667A';
  const STEEL = '#8A90A2';
  const DIV   = '#e5e0d8';
  const GREEN = '#15803d';
  const AMBER = '#b45309';

  const TERMS = {
    due_on_receipt: 'Due on Receipt',
    net_7: 'Net 7', net_15: 'Net 15', net_30: 'Net 30',
    net_45: 'Net 45', net_60: 'Net 60', net_90: 'Net 90',
  };

  const fmt   = n => `$${parseFloat(n || 0).toFixed(2)}`;
  const fmtDt = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const fmtQ  = v => { const n = parseFloat(v); return isNaN(n) ? '1' : n % 1 === 0 ? `${n}` : n.toFixed(2); };

  const total    = parseFloat(inv.amount || 0);
  const subtotal = parseFloat(inv.subtotal ?? total);
  const taxAmt   = parseFloat(inv.tax_amount || 0);
  const discAmt  = parseFloat(inv.discount_amount || 0);
  const balance  = parseFloat(inv.balance ?? inv.amount ?? 0);
  const amtPaid  = Math.max(0, parseFloat((total - balance).toFixed(2)));
  const invNum   = inv.invoice_number
    ? `#${inv.invoice_number}`
    : (inv.invoice_number_display || inv.id.slice(0, 8).toUpperCase());

  const lineItems = Array.isArray(inv.line_items) && inv.line_items.length > 0
    ? inv.line_items
    : [{ name: inv.service_type || inv.subject || 'Service', quantity: 1, unit_price: subtotal, line_total: subtotal }];

  const hasTax = lineItems.some(li => li.taxable) || taxAmt > 0;

  let logoBuf = null;
  if (inv.logo_url) logoBuf = await fetchLogoBuffer(inv.logo_url).catch(() => null);

  function jobRef() {
    if (inv.work_order_number && inv.project_number)
      return `PRJ-${String(inv.project_number).padStart(4, '0')} · WO-${String(inv.work_order_number).padStart(3, '0')}${inv.work_order_title ? ` · ${inv.work_order_title}` : ''}`;
    if (inv.work_order_number)
      return `WO-${String(inv.work_order_number).padStart(3, '0')}${inv.work_order_title ? ` · ${inv.work_order_title}` : ''}`;
    if (inv.project_number)
      return `PRJ-${String(inv.project_number).padStart(4, '0')}${inv.project_name ? ` · ${inv.project_name}` : ''}`;
    if (inv.job_id && inv.scheduled_at)
      return `Job · ${new Date(inv.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    return null;
  }

  return new Promise((resolve, reject) => {
    const doc  = new PDFDoc({ margin: 50, size: 'LETTER' });
    const bufs = [];
    doc.on('data',  c => bufs.push(c));
    doc.on('end',   () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const M = 50, R = 562;  // left margin, right edge

    // ── HEADER: Left = business identity; Right = document identity ───────────
    const LCW = 255, RCX = 325, RCW = R - RCX;

    let ly = M;
    if (logoBuf) {
      try { doc.image(logoBuf, M, ly, { fit: [130, 60] }); ly += 68; }
      catch (_) { logoBuf = null; }
    }
    if (!logoBuf) {
      doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY)
         .text(inv.business_name || 'Your Business', M, ly, { width: LCW, lineBreak: false });
      ly += 22;
    }
    const bizCity = [inv.business_city, inv.business_state, inv.business_zip].filter(Boolean).join(', ');
    [inv.business_address, bizCity, inv.business_phone, inv.business_email, inv.business_website]
      .filter(Boolean).forEach(ln => {
        doc.font('Helvetica').fontSize(9).fillColor(SLATE).text(ln, M, ly, { width: LCW, lineBreak: false });
        ly += 12;
      });

    let ry = M;
    doc.font('Helvetica-Bold').fontSize(28).fillColor(NAVY)
       .text('INVOICE', RCX, ry, { width: RCW, align: 'right', lineBreak: false });
    ry += 38;
    [
      [invNum,                                        'Invoice #'],
      [fmtDt(inv.issued_date || inv.created_at),     'Date'],
      ...(inv.due_date       ? [[fmtDt(inv.due_date),                             'Due']]   : []),
      ...(inv.payment_terms  ? [[TERMS[inv.payment_terms] || inv.payment_terms,   'Terms']] : []),
    ].forEach(([val, lbl]) => {
      doc.font('Helvetica').fontSize(9).fillColor(STEEL).text(lbl, RCX, ry, { width: 52, lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor(NAVY).text(val, RCX + 55, ry, { width: RCW - 55, align: 'right', lineBreak: false });
      ry += 13;
    });

    doc.x = M; doc.y = Math.max(ly, ry) + 18;

    // ── DIVIDER ───────────────────────────────────────────────────────────────
    doc.moveTo(M, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
    doc.x = M; doc.y += 14;

    // ── BILL TO + SERVICE ADDRESS ─────────────────────────────────────────────
    const svcAddr = inv.job_address && inv.job_address !== inv.client_address ? inv.job_address : null;
    const ref     = jobRef();
    const billW   = svcAddr ? 228 : (R - M);
    const svcX    = M + billW + 22;
    const svcW    = R - svcX;
    const billStartY = doc.y;

    let by = billStartY;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(STEEL).text('BILL TO', M, by, { width: billW, lineBreak: false }); by += 12;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(inv.client_name || '', M, by, { width: billW, lineBreak: false }); by += 15;
    const clientCityLine = [inv.client_city, inv.client_state, inv.client_zip].filter(Boolean).join(', ');
    [inv.client_address, clientCityLine, inv.client_phone, inv.client_email]
      .filter(Boolean).forEach(ln => {
        doc.font('Helvetica').fontSize(9).fillColor(SLATE).text(ln, M, by, { width: billW, lineBreak: false }); by += 12;
      });
    if (!svcAddr && ref) {
      doc.font('Helvetica').fontSize(9).fillColor(STEEL).text(ref, M, by, { width: billW, lineBreak: false }); by += 12;
    }

    let sy = billStartY;
    if (svcAddr) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(STEEL).text('SERVICE ADDRESS', svcX, sy, { width: svcW, lineBreak: false }); sy += 12;
      doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(svcAddr, svcX, sy, { width: svcW, lineBreak: false }); sy += 14;
      if (ref) {
        doc.font('Helvetica').fontSize(9).fillColor(STEEL).text(ref, svcX, sy, { width: svcW, lineBreak: false }); sy += 12;
      }
    }

    doc.x = M; doc.y = Math.max(by, sy) + 18;

    // ── LINE ITEMS TABLE ──────────────────────────────────────────────────────
    const CD   = M;
    const CDW  = hasTax ? 218 : 255;
    const CQ   = M + CDW + 10;
    const CQW  = 42;
    const CP   = CQ + CQW + 5;
    const CPW  = 90;
    const CT   = CP + CPW + 5;
    const CTW  = 28;
    const CTT  = hasTax ? CT + CTW + 5 : CP + CPW + 5;
    const CTTW = R - CTT;

    doc.moveTo(M, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
    const thY = doc.y + 7;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(STEEL);
    doc.text('DESCRIPTION', CD,  thY, { width: CDW,  lineBreak: false });
    doc.text('QTY',         CQ,  thY, { width: CQW,  align: 'right', lineBreak: false });
    doc.text('UNIT PRICE',  CP,  thY, { width: CPW,  align: 'right', lineBreak: false });
    if (hasTax) doc.text('TAX', CT, thY, { width: CTW, align: 'center', lineBreak: false });
    doc.text('TOTAL', CTT, thY, { width: CTTW, align: 'right', lineBreak: false });
    doc.x = M; doc.y = thY + 14;
    doc.moveTo(M, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
    doc.x = M; doc.y += 8;

    lineItems.forEach((item, idx) => {
      const rowY = doc.y;
      const name = item.name || item.description || 'Service';
      const desc = (item.name && item.description) ? item.description.trim() : '';
      const qty  = fmtQ(item.quantity ?? 1);
      const up   = parseFloat(item.unit_price ?? item.amount ?? 0);
      const lt   = parseFloat(item.line_total  ?? item.amount ?? (up * parseFloat(item.quantity || 1)));

      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(name, CD,  rowY, { width: CDW,  lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(qty,     CQ,  rowY, { width: CQW,  align: 'right',  lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(fmt(up), CP,  rowY, { width: CPW,  align: 'right',  lineBreak: false });
      if (hasTax) {
        doc.font('Helvetica').fontSize(9).fillColor(item.taxable ? SLATE : '#e0ddd8')
           .text('✓', CT, rowY, { width: CTW, align: 'center', lineBreak: false });
      }
      doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(fmt(lt), CTT, rowY, { width: CTTW, align: 'right',  lineBreak: false });

      doc.x = M; doc.y = rowY + 16;
      if (desc) {
        doc.font('Helvetica').fontSize(8.5).fillColor(SLATE).text(desc, CD, doc.y, { width: CDW });
        doc.x = M; doc.y += 4;
      }
      if (idx < lineItems.length - 1) {
        doc.moveTo(M, doc.y + 2).lineTo(R, doc.y + 2).strokeColor('#f0ede8').lineWidth(0.3).stroke();
        doc.x = M; doc.y += 10;
      } else {
        doc.x = M; doc.y += 8;
      }
    });

    // ── TOTALS ────────────────────────────────────────────────────────────────
    const TLX = M + 292, TLW = 118, TVX = TLX + TLW + 8, TVW = R - TVX;

    doc.moveTo(TLX, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
    doc.x = M; doc.y += 7;

    function tRow(label, value, opts = {}) {
      const y = doc.y;
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(opts.large ? 11 : 9.5).fillColor(opts.lc || SLATE)
         .text(label, TLX, y, { width: TLW, lineBreak: false });
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(opts.large ? 11 : 9.5).fillColor(opts.vc || NAVY)
         .text(value, TVX, y, { width: TVW, align: 'right', lineBreak: false });
      doc.x = M; doc.y = y + (opts.large ? 16 : 14);
    }

    if (discAmt > 0 || taxAmt > 0) tRow('Subtotal', fmt(subtotal));
    if (discAmt > 0) {
      const discLabel = inv.discount_label
        || (inv.discount_type === 'percent' ? `Discount (${parseFloat(inv.discount_value || 0)}%)` : 'Discount');
      tRow(discLabel, `-${fmt(discAmt)}`);
    }
    if (taxAmt > 0) tRow('Tax', fmt(taxAmt));

    doc.moveTo(TLX, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
    doc.x = M; doc.y += 6;
    tRow('Total', fmt(total), { bold: true, large: true });
    if (amtPaid > 0) {
      tRow('Amount Paid', `-${fmt(amtPaid)}`, { vc: GREEN });
      doc.moveTo(TLX, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
      doc.x = M; doc.y += 6;
      tRow('Balance Due', fmt(balance), { bold: true, large: true, vc: balance <= 0 ? GREEN : AMBER });
    }

    // ── STATUS BANNER ─────────────────────────────────────────────────────────
    doc.x = M; doc.y += 22;
    const statusColor = inv.status === 'paid' ? GREEN : inv.status === 'void' ? STEEL : AMBER;
    const statusLabel = inv.status === 'paid' ? 'PAID IN FULL'
                      : inv.status === 'void' ? 'VOID'
                      : inv.status === 'draft' ? 'DRAFT — Not yet finalized'
                      : `BALANCE DUE: ${fmt(balance)}`;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(statusColor).text(statusLabel, { align: 'center' });

    if (inv.payment_link && inv.status === 'pending') {
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(9).fillColor(SLATE)
         .text(`Pay online: ${inv.payment_link}`, M, doc.y, { width: R - M, align: 'center' });
    }

    // ── CLIENT MESSAGE ────────────────────────────────────────────────────────
    if (inv.client_message) {
      doc.moveDown(1.2);
      doc.moveTo(M, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
      doc.x = M; doc.y += 10;
      doc.font('Helvetica').fontSize(9.5).fillColor(SLATE)
         .text(inv.client_message, M, doc.y, { width: R - M, lineGap: 2 });
    }

    // ── FOOTER ────────────────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc.moveTo(M, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
    doc.x = M; doc.y += 8;
    doc.font('Helvetica').fontSize(8.5).fillColor(STEEL)
       .text(inv.terms || 'Thank you for your business.', M, doc.y, { width: R - M, align: 'center' });

    doc.end();
  });
}

// ─── Receipt PDF ──────────────────────────────────────────────────────────────

const RECEIPT_METHOD_LABELS = {
  CARD:'Credit/Debit Card', ACH:'Bank Payment (ACH)', CASH:'Cash', CHECK:'Check',
  CASHAPP:'Cash App', PAYPAL:'PayPal', VENMO:'Venmo', ZELLE:'Zelle',
  EXTERNAL_CARD:'Credit/Debit Card', EXTERNAL_ACH:'Bank Payment (ACH)', OTHER:'Other',
  cash:'Cash', check:'Check', other:'Other',
};

async function generateReceiptPdfBuffer(inv, pmts) {
  const NAVY  = '#1C2333';
  const SLATE = '#5F667A';
  const STEEL = '#8A90A2';
  const DIV   = '#e5e0d8';
  const GREEN = '#15803d';

  const fmt   = n => `$${parseFloat(n || 0).toFixed(2)}`;
  const fmtDt = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  let logoBuf = null;
  if (inv.logo_url) logoBuf = await fetchLogoBuffer(inv.logo_url).catch(() => null);

  const totalPaid = pmts.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const receiptDate = pmts.length ? (pmts[0].payment_date || pmts[0].created_at) : inv.paid_at;

  return new Promise((resolve, reject) => {
    const doc  = new PDFDoc({ margin: 50, size: 'LETTER' });
    const bufs = [];
    doc.on('data',  c => bufs.push(c));
    doc.on('end',   () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const M = 50, R = 562;

    // ── HEADER ────────────────────────────────────────────────────────────────
    const LCW = 255, RCX = 325, RCW = R - RCX;

    let ly = M;
    if (logoBuf) {
      try { doc.image(logoBuf, M, ly, { fit: [130, 60] }); ly += 68; }
      catch (_) { logoBuf = null; }
    }
    if (!logoBuf) {
      doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY)
         .text(inv.business_name || 'Your Business', M, ly, { width: LCW, lineBreak: false });
      ly += 22;
    }
    const bizCity = [inv.business_city, inv.business_state, inv.business_zip].filter(Boolean).join(', ');
    [inv.business_address, bizCity, inv.business_phone, inv.business_email, inv.business_website]
      .filter(Boolean).forEach(ln => {
        doc.font('Helvetica').fontSize(9).fillColor(SLATE).text(ln, M, ly, { width: LCW, lineBreak: false });
        ly += 12;
      });

    let ry = M;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY)
       .text('PAYMENT RECEIPT', RCX, ry, { width: RCW, align: 'right', lineBreak: false });
    ry += 28;
    [
      [fmtDt(receiptDate),                              'Date'],
      [inv.invoice_number_display || inv.invoice_number ? `#${inv.invoice_number}` : '—', 'Invoice'],
    ].forEach(([val, lbl]) => {
      doc.font('Helvetica').fontSize(9).fillColor(STEEL).text(lbl, RCX, ry, { width: 52, lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor(NAVY).text(val, RCX + 55, ry, { width: RCW - 55, align: 'right', lineBreak: false });
      ry += 13;
    });

    doc.x = M; doc.y = Math.max(ly, ry) + 18;

    // ── DIVIDER ───────────────────────────────────────────────────────────────
    doc.moveTo(M, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
    doc.x = M; doc.y += 14;

    // ── BILL TO ───────────────────────────────────────────────────────────────
    let by = doc.y;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(STEEL).text('BILL TO', M, by, { width: R - M, lineBreak: false }); by += 12;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(inv.client_name || '', M, by, { width: R - M, lineBreak: false }); by += 15;
    const clientCityLine = [inv.client_city, inv.client_state, inv.client_zip].filter(Boolean).join(', ');
    [inv.client_address, clientCityLine, inv.client_phone, inv.client_email]
      .filter(Boolean).forEach(ln => {
        doc.font('Helvetica').fontSize(9).fillColor(SLATE).text(ln, M, by, { width: R - M, lineBreak: false }); by += 12;
      });
    doc.x = M; doc.y = by + 18;

    // ── PAYMENT SECTION(S) ────────────────────────────────────────────────────
    function detailRow(label, value) {
      const y = doc.y;
      doc.font('Helvetica').fontSize(10).fillColor(STEEL).text(label, M, y, { width: 160, lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(value, M + 165, y, { width: R - M - 165, lineBreak: false });
      doc.x = M; doc.y = y + 14;
    }

    pmts.forEach((pmt, pmtIdx) => {
      if (pmtIdx > 0) {
        doc.moveTo(M, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
        doc.x = M; doc.y += 14;
      }

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(STEEL)
         .text('PAYMENT DETAILS', M, doc.y, { width: R - M, lineBreak: false });
      doc.x = M; doc.y += 14;

      detailRow('Amount Paid', fmt(pmt.amount));
      detailRow('Payment Method', RECEIPT_METHOD_LABELS[pmt.method] || pmt.method || 'Other');
      if (pmt.payment_date) detailRow('Date', fmtDt(pmt.payment_date));
      if (pmt.reference)    detailRow('Reference', pmt.reference);
      if (pmt.note)         detailRow('Note', pmt.note);
      if (pmt.id)           detailRow('Transaction ID', pmt.id.slice(0, 8).toUpperCase());

      doc.x = M; doc.y += 10;

      // ── ALLOCATION TABLE ───────────────────────────────────────────────────
      if (pmt.allocations && pmt.allocations.length > 0) {
        doc.moveTo(M, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
        doc.x = M; doc.y += 8;

        const C1 = M,        C1W = 65;
        const C2 = M + 70,   C2W = 190;
        const C3 = M + 265,  C3W = 85;
        const C4 = M + 355,  C4W = 85;
        const C5 = M + 445,  C5W = R - (M + 445);

        const thY = doc.y;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(STEEL);
        doc.text('INVOICE', C1, thY, { width: C1W, lineBreak: false });
        doc.text('DESCRIPTION', C2, thY, { width: C2W, lineBreak: false });
        doc.text('APPLIED', C3, thY, { width: C3W, align: 'right', lineBreak: false });
        doc.text('INV. TOTAL', C4, thY, { width: C4W, align: 'right', lineBreak: false });
        doc.text('BALANCE', C5, thY, { width: C5W, align: 'right', lineBreak: false });
        doc.x = M; doc.y = thY + 12;
        doc.moveTo(M, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.3).stroke();
        doc.x = M; doc.y += 6;

        pmt.allocations.forEach(alloc => {
          const rowY = doc.y;
          const bal  = parseFloat(alloc.current_balance ?? 0);
          doc.font('Helvetica').fontSize(9.5).fillColor(NAVY);
          doc.text(`#${alloc.invoice_number_display}`, C1, rowY, { width: C1W, lineBreak: false });
          doc.text(alloc.subject || alloc.service_type || 'Service', C2, rowY, { width: C2W, lineBreak: false });
          doc.text(fmt(alloc.allocated_amount), C3, rowY, { width: C3W, align: 'right', lineBreak: false });
          doc.text(fmt(alloc.invoice_total),    C4, rowY, { width: C4W, align: 'right', lineBreak: false });
          doc.font('Helvetica').fontSize(9.5).fillColor(bal <= 0.001 ? GREEN : SLATE);
          doc.text(fmt(bal), C5, rowY, { width: C5W, align: 'right', lineBreak: false });
          doc.x = M; doc.y = rowY + 14;
        });
        doc.x = M; doc.y += 6;
      }
    });

    // ── TOTAL PAID ────────────────────────────────────────────────────────────
    const TLX = M + 310, TLW = 130, TVX = TLX + TLW + 8, TVW = R - TVX;
    doc.moveTo(TLX, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
    doc.x = M; doc.y += 8;
    const totY = doc.y;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('Total Paid', TLX, totY, { width: TLW, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12).fillColor(GREEN).text(fmt(totalPaid), TVX, totY, { width: TVW, align: 'right', lineBreak: false });
    doc.x = M; doc.y = totY + 20;

    // ── CONFIRMATION ──────────────────────────────────────────────────────────
    doc.x = M; doc.y += 16;
    doc.moveTo(M, doc.y).lineTo(R, doc.y).strokeColor(DIV).lineWidth(0.5).stroke();
    doc.x = M; doc.y += 10;
    doc.font('Helvetica').fontSize(9.5).fillColor(SLATE)
       .text('Thank you for your payment. This receipt confirms your payment was received.',
             M, doc.y, { width: R - M, align: 'center' });
    doc.x = M; doc.y += 16;
    doc.font('Helvetica').fontSize(8.5).fillColor(STEEL)
       .text(inv.business_name || 'Your Business', M, doc.y, { width: R - M, align: 'center', lineBreak: false });

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
    let finalExistingDraftId    = null;

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
        `SELECT id, status, invoice_number FROM invoices WHERE job_id = $1 AND account_id = $2`,
        [job_id, req.accountId]
      );
      const activeInvoice = dupRes.rows.find(r => r.status === 'pending' || r.status === 'paid');
      if (activeInvoice) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'An invoice already exists for this job' });
      }
      const existingDraft = dupRes.rows.find(r => r.status === 'draft') || null;
      finalClientId = job.client_id;
      finalJobId    = job_id;
      // Store draft ID so INSERT block can UPDATE instead (unique constraint on job_id)
      if (existingDraft) finalExistingDraftId = existingDraft.id;
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

    let rows;
    if (finalExistingDraftId) {
      // Job already has a draft auto-invoice; UPDATE it in-place to respect the unique job_id constraint
      const updateRes = await client.query(
        `UPDATE invoices SET
           source_type    = $2,
           status         = $3,
           amount         = $4,
           tax_amount     = $5,
           subtotal       = $6,
           discount_type  = $7,
           discount_value = $8,
           discount_amount= $9,
           discount_label = $10,
           line_items     = $11,
           subject        = $12,
           issued_date    = $13,
           payment_terms  = $14,
           due_date       = $15,
           client_message = $16,
           internal_notes = $17,
           terms          = $18,
           payment_options= $19,
           invoice_number = COALESCE(invoice_number, $20),
           balance        = $4,
           updated_at     = NOW()
         WHERE id = $1 AND account_id = $21
         RETURNING *`,
        [
          finalExistingDraftId, source_type, status, total, taxAmount, subtotal,
          discount_type || null, parseFloat(discount_value) || null, discountAmount || null, discount_label || null,
          JSON.stringify(validItems), finalSubject, finalIssuedDate, payment_terms, finalDueDate,
          finalClientMessage, internal_notes || null, terms || null,
          payment_options ? JSON.stringify(payment_options) : '{}',
          invoiceNumber, req.accountId,
        ]
      );
      rows = updateRes.rows;
    } else {
      const insertRes = await client.query(
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
      rows = insertRes.rows;
    }

    // Initialize stored balance = invoice amount
    await client.query(
      `UPDATE invoices SET balance = amount WHERE id = $1 AND balance IS NULL`,
      [rows[0].id]
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
                COALESCE(accept_cash, TRUE)               AS accept_cash,
                COALESCE(accept_check, TRUE)              AS accept_check,
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
      accept_cash:             bs.accept_cash !== false,
      accept_check:            bs.accept_check !== false,
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
      balance:        `COALESCE(i.balance, CASE WHEN i.status IN ('pending','failed') THEN i.amount::numeric WHEN i.status = 'paid' THEN 0 ELSE NULL END)`,
      created_at:     'i.created_at',
    };
    const sortCol = ALLOWED_SORTS[sort] || ALLOWED_SORTS.created_at;
    const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const pg      = Math.max(1, parseInt(page, 10) || 1);
    const ps      = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
    const offset  = (pg - 1) * ps;

    const kpiRes = await pool.query(
      `SELECT
         -- Outstanding: remaining balance on pending + partially_paid invoices
         COALESCE(SUM(CASE WHEN status IN ('pending','partially_paid')
                           THEN COALESCE(balance, amount) ELSE 0 END), 0)                                  AS outstanding,
         -- Collected: full amount for paid + already-received portion for partially_paid
         COALESCE(SUM(CASE WHEN status = 'paid'          THEN amount
                           WHEN status = 'partially_paid' THEN amount - COALESCE(balance, 0)
                           ELSE 0 END), 0)                                                                  AS collected,
         -- Past due: remaining balance on overdue open invoices
         COALESCE(SUM(CASE WHEN status IN ('pending','partially_paid','failed')
                                AND due_date IS NOT NULL AND due_date < NOW()
                           THEN COALESCE(balance, amount) ELSE 0 END), 0)                                  AS past_due,
         COUNT(CASE WHEN status IN ('pending','partially_paid','failed')
                         AND due_date IS NOT NULL AND due_date < NOW() THEN 1 END)::int                     AS past_due_count,
         COUNT(*)::int                                                                                       AS total_count,
         COUNT(CASE WHEN status = 'pending'         THEN 1 END)::int                                        AS count_pending,
         COUNT(CASE WHEN status = 'partially_paid'  THEN 1 END)::int                                        AS count_partially_paid,
         COUNT(CASE WHEN status = 'paid'            THEN 1 END)::int                                        AS count_paid,
         COUNT(CASE WHEN status = 'void'            THEN 1 END)::int                                        AS count_void,
         COUNT(CASE WHEN status = 'draft'           THEN 1 END)::int                                        AS count_draft,
         COUNT(CASE WHEN status != 'void'           THEN 1 END)::int                                        AS issued_count,
         COALESCE(SUM(CASE WHEN status != 'void'   THEN amount ELSE 0 END), 0)                              AS issued_total
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
        all:             k.total_count,
        pending:         k.count_pending,
        partially_paid:  k.count_partially_paid,
        paid:            k.count_paid,
        void:            k.count_void,
        draft:           k.count_draft,
        past_due:        k.past_due_count,
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
           COALESCE(i.balance,
             CASE
               WHEN i.status IN ('pending','failed') THEN i.amount
               WHEN i.status = 'paid'                THEN 0
               ELSE NULL
             END
           )                            AS balance,
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
              c.name AS client_name, c.email AS client_email,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'name',        js.service_name,
                   'description', COALESCE(js.service_notes, ''),
                   'quantity',    js.quantity,
                   'price_cents', js.price_cents
                 ) ORDER BY js.sort_order)
                 FROM job_services js
                 WHERE js.job_id = j.id AND js.account_id = j.account_id),
                '[]'::json
              ) AS line_items
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       WHERE j.account_id = $1
         AND j.status = 'complete'
         AND NOT EXISTS (
           SELECT 1 FROM invoices inv
           WHERE inv.job_id = j.id
             AND inv.account_id = $1
             AND inv.status IN ('pending', 'paid', 'partially_paid', 'failed')
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

// ─── PUT /api/invoices/:id — update a draft invoice in-place ─────────────────
router.put('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    subject,
    line_items: reqLineItems,
    discount_type,
    discount_value,
    discount_label,
    payment_terms = 'due_on_receipt',
    due_date,
    issued_date,
    client_message,
    internal_notes,
    terms,
  } = req.body;

  try {
    const [invoiceRes, settingsRes] = await Promise.all([
      pool.query(`SELECT * FROM invoices WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]),
      pool.query(`SELECT COALESCE(tax_rate, 0) AS tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]),
    ]);
    const invoice = invoiceRes.rows[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft invoices can be edited' });
    }

    const taxRate = parseFloat(settingsRes.rows[0]?.tax_rate || 0);

    const existingItems = (() => {
      try { return JSON.parse(invoice.line_items || '[]'); } catch { return []; }
    })();
    const baseLineItems = Array.isArray(reqLineItems) && reqLineItems.length > 0
      ? reqLineItems
      : existingItems;

    if (baseLineItems.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }

    const { validItems, subtotal, discountAmount, taxAmount, total } =
      computeTotals(baseLineItems, discount_type, discount_value, taxRate);

    const finalIssuedDate = issued_date || invoice.issued_date;
    const finalDueDate = due_date !== undefined
      ? (due_date || null)
      : (payment_terms !== 'due_on_receipt' && payment_terms !== 'custom'
          ? computeDueDate(payment_terms, finalIssuedDate)
          : null);

    const { rows } = await pool.query(
      `UPDATE invoices
       SET subject         = $1,
           issued_date     = $2,
           payment_terms   = $3,
           due_date        = $4,
           line_items      = $5,
           discount_type   = $6,
           discount_value  = $7,
           discount_amount = $8,
           discount_label  = $9,
           client_message  = $10,
           internal_notes  = $11,
           terms           = $12,
           amount          = $13,
           subtotal        = $14,
           tax_amount      = $15,
           balance         = $13,
           updated_by      = $16,
           updated_at      = NOW()
       WHERE id = $17 AND account_id = $18
       RETURNING *`,
      [
        subject ?? invoice.subject,
        finalIssuedDate,
        payment_terms,
        finalDueDate,
        JSON.stringify(validItems),
        discount_type || null,
        discount_value != null ? parseFloat(discount_value) || null : null,
        discountAmount || null,
        discount_label || null,
        client_message ?? invoice.client_message ?? null,
        internal_notes ?? invoice.internal_notes ?? null,
        terms ?? invoice.terms ?? null,
        total,
        subtotal,
        taxAmount,
        req.userId,
        req.params.id,
        req.accountId,
      ]
    );

    res.json(rows[0]);
  } catch (err) {
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
              j.service_type, j.scheduled_at, j.tech_id,
              j.project_id AS job_project_id,
              j.work_order_number,
              j.title AS work_order_title,
              p.name AS project_name,
              p.project_number
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN jobs j ON j.id = i.job_id
       LEFT JOIN projects p ON p.id = COALESCE(i.project_id, j.project_id)
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

    let emailWarning = null;
    if (!inv.client_email) {
      emailWarning = 'No email address on file for this client.';
    } else {
      try {
        const pdfBuf = await generateInvoicePdfBuffer({ ...inv, payment_link: payLink });
        await email.send({
          to:      inv.client_email,
          subject: `Invoice from ${inv.business_name} — $${parseFloat(inv.amount).toFixed(2)}`,
          html:    email.invoiceHtml(inv.client_name, inv.service_type, inv.amount, payLink, inv.business_name, inv.tax_amount),
          attachments: [{
            filename:    `invoice-${inv.invoice_number || inv.id.slice(0, 8)}.pdf`,
            content:     pdfBuf,
            contentType: 'application/pdf',
          }],
        });
      } catch (emailErr) {
        console.error('[Invoice email]', emailErr.message);
        emailWarning = 'Invoice marked as sent but email delivery failed. Check SMTP settings.';
      }
    }

    notify.create(req.accountId, 'invoice_sent',
      `Invoice sent to ${inv.client_name}`,
      `$${parseFloat(inv.amount).toFixed(2)} for ${inv.service_type}`,
      '/invoices'
    );

    res.json({ success: true, payment_link: payLink, ...(emailWarning ? { email_warning: emailWarning } : {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices/:id/pdf ────────────────────────────────────────────────
router.get('/:id/pdf', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*,
              COALESCE(i.invoice_number::text, UPPER(LEFT(i.id::text,8))) AS invoice_number_display,
              c.name    AS client_name,  c.email AS client_email, c.phone AS client_phone,
              c.address AS client_address, c.city AS client_city,
              c.state   AS client_state,  c.zip  AS client_zip,
              j.service_address AS job_address,
              j.service_type, j.scheduled_at,
              j.work_order_number, j.title AS work_order_title,
              p.name AS project_name, p.project_number,
              COALESCE(bp.business_name, a.name) AS business_name,
              bp.phone   AS business_phone,
              bp.address AS business_address, bp.city AS business_city,
              bp.state   AS business_state,   bp.zip  AS business_zip,
              bp.logo_url, bp.website AS business_website,
              (SELECT email FROM users
               WHERE account_id = i.account_id AND role = 'owner'
               ORDER BY created_at LIMIT 1) AS business_email
       FROM invoices i
       JOIN clients  c  ON c.id  = i.client_id
       LEFT JOIN jobs j ON j.id  = i.job_id
       LEFT JOIN projects p ON p.id = COALESCE(i.project_id, j.project_id)
       JOIN accounts a  ON a.id  = i.account_id
       LEFT JOIN business_profiles bp ON bp.account_id = i.account_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const inv    = rows[0];
    const pdfBuf = await generateInvoicePdfBuffer(inv);
    const fname  = `invoice-${inv.invoice_number || inv.id.slice(0, 8)}.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${fname}"`,
    });
    res.send(pdfBuf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices/:id/receipt ───────────────────────────────────────────
router.get('/:id/receipt', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*,
              COALESCE(i.invoice_number::text, UPPER(LEFT(i.id::text,8))) AS invoice_number_display,
              c.name    AS client_name,  c.email AS client_email, c.phone AS client_phone,
              c.address AS client_address, c.city AS client_city,
              c.state   AS client_state,  c.zip  AS client_zip,
              COALESCE(bp.business_name, a.name) AS business_name,
              bp.phone   AS business_phone,
              bp.address AS business_address, bp.city AS business_city,
              bp.state   AS business_state,   bp.zip  AS business_zip,
              bp.logo_url, bp.website AS business_website,
              (SELECT email FROM users
               WHERE account_id = i.account_id AND role = 'owner'
               ORDER BY created_at LIMIT 1) AS business_email
       FROM invoices i
       JOIN clients  c  ON c.id  = i.client_id
       JOIN accounts a  ON a.id  = i.account_id
       LEFT JOIN business_profiles bp ON bp.account_id = i.account_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const inv = rows[0];

    if (!['paid', 'partially_paid'].includes(inv.status)) {
      return res.status(400).json({ error: 'Receipt is only available for paid invoices.' });
    }

    const targetPaymentId = req.query.payment_id || null;

    // Query canonical payment_allocations → payments records for this invoice
    const { rows: allocRows } = await pool.query(
      `SELECT pa.payment_id, pa.created_at AS pa_created_at,
              p.amount  AS payment_amount, p.method, p.reference, p.note,
              p.payment_date, p.created_at AS pmt_created_at,
              pa2.invoice_id    AS alloc_invoice_id,
              COALESCE(i2.invoice_number::text, UPPER(LEFT(i2.id::text,8))) AS alloc_inv_num_display,
              i2.amount   AS alloc_inv_total,
              i2.subject  AS alloc_inv_subject,
              j2.service_type AS alloc_svc_type,
              pa2.amount  AS alloc_pa_amount,
              pa2.created_at AS alloc_created_at
       FROM payment_allocations pa
       JOIN payments p              ON p.id  = pa.payment_id
       JOIN payment_allocations pa2 ON pa2.payment_id = pa.payment_id
       JOIN invoices i2             ON i2.id = pa2.invoice_id
       LEFT JOIN jobs j2            ON j2.id = i2.job_id
       WHERE pa.invoice_id = $1 AND p.account_id = $2
         AND ($3::uuid IS NULL OR pa.payment_id = $3)
       ORDER BY p.payment_date, p.created_at, pa2.invoice_id`,
      [req.params.id, req.accountId, targetPaymentId]
    );

    let pmts = [];
    if (allocRows.length > 0) {
      const pmtMap = new Map();
      for (const r of allocRows) {
        if (!pmtMap.has(r.payment_id)) {
          pmtMap.set(r.payment_id, {
            id:           r.payment_id,
            amount:       r.payment_amount,
            method:       r.method,
            reference:    r.reference,
            note:         r.note,
            payment_date: r.payment_date,
            created_at:   r.pmt_created_at,
            allocations:  [],
          });
        }

        // Compute historical balance: invoice.amount minus all allocations
        // (payment + deposit) applied on or before this specific allocation's timestamp
        let historicalBalance = parseFloat(inv.amount || 0);
        if (targetPaymentId && r.payment_id === targetPaymentId) {
          const ts = r.alloc_created_at || r.pa_created_at;
          const { rows: hRows } = await pool.query(
            `SELECT
               COALESCE((SELECT SUM(pa3.amount) FROM payment_allocations pa3
                         WHERE pa3.invoice_id = $1 AND pa3.account_id = $2
                           AND pa3.created_at <= $3), 0)
               +
               COALESCE((SELECT SUM(da.amount) FROM deposit_allocations da
                         WHERE da.invoice_id = $1 AND da.account_id = $2
                           AND da.voided_at IS NULL AND da.created_at <= $3), 0)
             AS total_applied`,
            [req.params.id, req.accountId, ts]
          );
          historicalBalance = Math.max(0,
            parseFloat(inv.amount || 0) - parseFloat(hRows[0]?.total_applied || 0)
          );
        }

        pmtMap.get(r.payment_id).allocations.push({
          invoice_id:             r.alloc_invoice_id,
          invoice_number_display: r.alloc_inv_num_display,
          subject:                r.alloc_inv_subject,
          service_type:           r.alloc_svc_type,
          allocated_amount:       r.alloc_pa_amount,
          invoice_total:          r.alloc_inv_total,
          current_balance:        targetPaymentId ? historicalBalance : (inv.balance ?? 0),
        });
      }
      pmts = Array.from(pmtMap.values());
    } else if (!targetPaymentId) {
      // Fallback for non-filtered requests: paths 1 & 2 (manual/Stripe card-on-file)
      const method = inv.stripe_payment_intent_id ? 'CARD' : (inv.paid_method || 'other');
      const paid   = parseFloat(inv.amount || 0) - parseFloat(inv.balance ?? 0);
      pmts = [{
        id:           inv.stripe_payment_intent_id || null,
        amount:       Math.max(0, paid),
        method,
        reference:    inv.payment_note || null,
        note:         null,
        payment_date: inv.paid_at,
        created_at:   inv.paid_at || inv.updated_at,
        allocations:  [{
          invoice_id:             inv.id,
          invoice_number_display: inv.invoice_number_display || String(inv.invoice_number || ''),
          subject:                inv.subject,
          service_type:           inv.service_type,
          allocated_amount:       Math.max(0, paid),
          invoice_total:          inv.amount,
          current_balance:        inv.balance ?? 0,
        }],
      }];
    }

    if (!pmts.length) {
      return res.status(404).json({ error: 'Payment not found for this invoice' });
    }

    const pdfBuf = await generateReceiptPdfBuffer(inv, pmts);
    const fname  = `receipt-${inv.invoice_number || inv.id.slice(0, 8)}.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${fname}"`,
    });
    res.send(pdfBuf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices/:id/payment-history ───────────────────────────────────
router.get('/:id/payment-history', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows: invRows } = await pool.query(
      `SELECT i.id, i.status, i.amount, i.balance, i.paid_method, i.paid_at,
              i.payment_note, i.stripe_payment_intent_id, i.void_reason, i.updated_at, i.updated_by,
              u.name AS updated_by_name
       FROM invoices i
       LEFT JOIN users u ON u.id = i.updated_by
       WHERE i.id = $1 AND i.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!invRows.length) return res.status(404).json({ error: 'Not found' });
    const inv = invRows[0];

    const METHOD_LABELS = {
      CARD: 'Credit/Debit Card', ACH: 'Bank Payment (ACH)',
      CASH: 'Cash', CHECK: 'Check',
      CASHAPP: 'Cash App', PAYPAL: 'PayPal', VENMO: 'Venmo', ZELLE: 'Zelle',
      EXTERNAL_CARD: 'Credit/Debit Card', EXTERNAL_ACH: 'Bank Payment (ACH)', OTHER: 'Other',
      cash: 'Cash', check: 'Check', other: 'Other',
    };

    const events = [];

    // Path 3 (canonical): payment_allocations → payments
    const { rows: allocRows } = await pool.query(
      `SELECT pa.amount AS allocated_amount,
              p.id AS payment_id, p.method, p.payment_date, p.reference, p.note,
              p.provider_transaction_id, p.created_at AS payment_created_at,
              u.name AS actor_name
       FROM payment_allocations pa
       JOIN payments p ON p.id = pa.payment_id
       LEFT JOIN users u ON u.id = p.created_by
       WHERE pa.invoice_id = $1 AND pa.account_id = $2
       ORDER BY p.payment_date ASC, p.created_at ASC`,
      [req.params.id, req.accountId]
    );

    if (allocRows.length > 0) {
      allocRows.forEach(r => {
        events.push({
          type:         'payment',
          source:       'workspace',
          payment_id:   r.payment_id,
          date:         r.payment_date,
          amount:       parseFloat(r.allocated_amount),
          method:       r.method,
          method_label: METHOD_LABELS[r.method] || r.method,
          reference:    r.reference || null,
          note:         r.note || null,
          transaction_id: r.provider_transaction_id || null,
          status:       'completed',
          actor_name:   r.actor_name || null,
        });
      });
    } else if (inv.paid_at || inv.stripe_payment_intent_id || inv.paid_method) {
      // Paths 1 & 2: synthesize from invoice fields
      const method = inv.stripe_payment_intent_id ? 'CARD' : (inv.paid_method || 'other');
      const paid   = Math.max(0, parseFloat(inv.amount || 0) - parseFloat(inv.balance ?? 0));
      events.push({
        type:           'payment',
        source:         inv.stripe_payment_intent_id ? 'stripe' : 'manual',
        payment_id:     null,
        date:           inv.paid_at,
        amount:         paid,
        method,
        method_label:   METHOD_LABELS[method] || method,
        reference:      inv.stripe_payment_intent_id || null,
        note:           inv.payment_note || null,
        transaction_id: inv.stripe_payment_intent_id || null,
        status:         'completed',
        actor_name:     inv.updated_by_name || null,
      });
    }

    // Deposit credit events
    const { rows: depAllocRows } = await pool.query(
      `SELECT da.id, da.amount, da.created_at, da.voided_at, da.deposit_id,
              d.collected_at, j.service_type,
              u.name AS actor_name
       FROM deposit_allocations da
       JOIN deposits d ON d.id = da.deposit_id
       LEFT JOIN jobs j ON j.id = d.job_id
       LEFT JOIN users u ON u.id = da.created_by
       WHERE da.invoice_id = $1 AND da.account_id = $2
       ORDER BY da.created_at ASC`,
      [req.params.id, req.accountId]
    );
    depAllocRows.forEach(r => {
      events.push({
        type:           r.voided_at ? 'deposit_credit_voided' : 'deposit_credit',
        source:         'deposit',
        payment_id:     null,
        deposit_id:     r.deposit_id,
        date:           r.created_at,
        amount:         parseFloat(r.amount),
        method:         null,
        method_label:   r.service_type ? `Deposit · ${r.service_type}` : 'Deposit Credit',
        reference:      null,
        note:           r.voided_at ? 'Voided' : null,
        transaction_id: null,
        status:         r.voided_at ? 'voided' : 'completed',
        actor_name:     r.actor_name || null,
      });
    });

    // Refund events — payments that were refunded and allocated to this invoice
    const { rows: refundRows } = await pool.query(
      `SELECT pr.id, pr.amount, pr.reason, pr.provider_refund_id, pr.refunded_at,
              p.method,
              u.name AS actor_name
       FROM payment_refunds pr
       JOIN payments p ON p.id = pr.payment_id
       JOIN payment_allocations pa ON pa.payment_id = p.id AND pa.invoice_id = $1
       LEFT JOIN users u ON u.id = pr.refunded_by
       WHERE pr.account_id = $2
       ORDER BY pr.refunded_at ASC`,
      [req.params.id, req.accountId]
    );
    refundRows.forEach(r => {
      events.push({
        type:           'refund',
        source:         r.provider_refund_id ? 'stripe' : 'manual',
        payment_id:     null,
        deposit_id:     null,
        date:           r.refunded_at,
        amount:         -parseFloat(r.amount),
        method:         r.method,
        method_label:   METHOD_LABELS[r.method] || r.method,
        reference:      r.provider_refund_id || null,
        note:           r.reason || null,
        transaction_id: r.provider_refund_id || null,
        status:         'refunded',
        actor_name:     r.actor_name || null,
      });
    });

    // Void event — invoice-level financial event
    if (inv.status === 'void') {
      events.push({
        type:           'void',
        source:         'manual',
        payment_id:     null,
        deposit_id:     null,
        date:           inv.updated_at,
        amount:         null,
        method:         null,
        method_label:   null,
        reference:      null,
        note:           inv.void_reason || null,
        transaction_id: null,
        status:         'voided',
        actor_name:     inv.updated_by_name || null,
      });
    }

    events.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    res.json({
      events,
      balance:        parseFloat(inv.balance ?? inv.amount ?? 0),
      invoice_status: inv.status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices/:id/available-deposits ────────────────────────────────
router.get('/:id/available-deposits', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows: invRows } = await pool.query(
      `SELECT client_id FROM invoices WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!invRows.length) return res.status(404).json({ error: 'Not found' });
    const { client_id } = invRows[0];

    const { rows } = await pool.query(
      `SELECT d.id, d.amount, d.collected_at, j.service_type,
              COALESCE((
                SELECT SUM(da.amount) FROM deposit_allocations da
                WHERE da.deposit_id = d.id AND da.voided_at IS NULL
              ), 0) AS applied_amount
       FROM deposits d
       LEFT JOIN jobs j ON j.id = d.job_id
       WHERE d.account_id = $1 AND d.client_id = $2 AND d.status = 'collected'
       ORDER BY d.collected_at DESC`,
      [req.accountId, client_id]
    );

    const available = rows
      .map(r => ({ ...r, available: parseFloat(r.amount) - parseFloat(r.applied_amount) }))
      .filter(r => r.available > 0.001);

    res.json(available);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/invoices/:id/apply-deposit ─────────────────────────────────────
router.post('/:id/apply-deposit', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { deposit_id, amount } = req.body;
  if (!deposit_id) return res.status(400).json({ error: 'deposit_id is required' });
  const alloc = parseFloat(amount);
  if (!alloc || alloc <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // Lock and verify invoice
    const { rows: invRows } = await dbClient.query(
      `SELECT id, amount, COALESCE(balance, amount) AS balance, status, client_id
       FROM invoices WHERE id = $1 AND account_id = $2
       FOR UPDATE`,
      [req.params.id, req.accountId]
    );
    if (!invRows.length) { await dbClient.query('ROLLBACK'); return res.status(404).json({ error: 'Invoice not found' }); }
    const inv = invRows[0];

    if (!['pending','partially_paid'].includes(inv.status)) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Invoice is not open for payment' });
    }
    if (alloc > parseFloat(inv.balance) + 0.001) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: `Amount $${alloc.toFixed(2)} exceeds invoice balance $${parseFloat(inv.balance).toFixed(2)}` });
    }

    // Lock deposit row to prevent concurrent double-application
    const { rows: depLock } = await dbClient.query(
      `SELECT id FROM deposits WHERE id = $1 AND account_id = $2 FOR UPDATE`,
      [deposit_id, req.accountId]
    );
    if (!depLock.length) { await dbClient.query('ROLLBACK'); return res.status(404).json({ error: 'Deposit not found' }); }

    // Verify deposit eligibility and available balance
    const { rows: depRows } = await dbClient.query(
      `SELECT d.amount, d.status, d.client_id,
              COALESCE((SELECT SUM(da.amount) FROM deposit_allocations da
                        WHERE da.deposit_id = d.id AND da.voided_at IS NULL), 0) AS applied_amount
       FROM deposits d WHERE d.id = $1 AND d.account_id = $2`,
      [deposit_id, req.accountId]
    );
    const dep = depRows[0];

    if (dep.status !== 'collected') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Deposit is not available (not yet collected)' });
    }
    if (dep.client_id !== inv.client_id) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Deposit does not belong to this invoice\'s client' });
    }
    const available = parseFloat(dep.amount) - parseFloat(dep.applied_amount);
    if (alloc > available + 0.001) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: `Amount $${alloc.toFixed(2)} exceeds available deposit balance $${available.toFixed(2)}` });
    }

    // Check for existing non-voided allocation (idempotency guard)
    const { rows: dupRows } = await dbClient.query(
      `SELECT id FROM deposit_allocations
       WHERE deposit_id = $1 AND invoice_id = $2 AND voided_at IS NULL`,
      [deposit_id, req.params.id]
    );
    if (dupRows.length) {
      await dbClient.query('ROLLBACK');
      return res.status(409).json({ error: 'This deposit has already been applied to this invoice' });
    }

    // Insert allocation record
    await dbClient.query(
      `INSERT INTO deposit_allocations (account_id, deposit_id, invoice_id, amount, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.accountId, deposit_id, req.params.id, alloc, req.userId]
    );

    // Update invoice balance/status
    const newBalance = Math.max(0, parseFloat(inv.balance) - alloc);
    const newStatus  = newBalance <= 0.001 ? 'paid' : 'partially_paid';
    const paidAt     = newStatus === 'paid' ? new Date().toISOString() : null;

    const { rows: updRows } = await dbClient.query(
      `UPDATE invoices
       SET balance = $1, status = $2, paid_at = COALESCE(paid_at, $3)
       WHERE id = $4 AND account_id = $5
       RETURNING *`,
      [newBalance, newStatus, paidAt, req.params.id, req.accountId]
    );

    await dbClient.query('COMMIT');
    res.json({ success: true, invoice: updRows[0] });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This deposit has already been applied to this invoice' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// ─── PATCH /api/invoices/:id/void ────────────────────────────────────────────
router.patch('/:id/void', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { reason = '' } = req.body;
  try {
    const { rows: current } = await pool.query(
      `SELECT status FROM invoices WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!current.length) return res.status(404).json({ error: 'Not found' });

    const { status } = current[0];
    if (status === 'draft') {
      return res.status(400).json({ error: 'Draft invoices cannot be voided — delete them instead.' });
    }
    if (status === 'paid') {
      return res.status(400).json({ error: 'Paid invoices cannot be voided. Issue a refund instead.' });
    }
    if (status === 'void') {
      return res.status(400).json({ error: 'Invoice is already void.' });
    }

    const { rows } = await pool.query(
      `UPDATE invoices
       SET status = 'void', void_reason = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3 AND account_id = $4
       RETURNING *`,
      [reason.trim() || null, req.userId, req.params.id, req.accountId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/invoices/:id ────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT status FROM invoices WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Only draft invoices may be deleted. To remove an issued invoice, void it instead.' });
    }
    await pool.query(
      `DELETE FROM invoices WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/invoices/:id/payments — record manual payment (partial-safe) ───
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

  const paymentDate = date || new Date().toISOString().slice(0, 10);
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // Lock invoice row to prevent concurrent double-payments
    const { rows } = await dbClient.query(
      `SELECT id, amount, COALESCE(balance, amount) AS balance, status, client_id
       FROM invoices WHERE id = $1 AND account_id = $2
       FOR UPDATE`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const inv = rows[0];

    if (inv.status === 'void') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot record payment on a void invoice' });
    }
    if (inv.status === 'paid') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Invoice is already paid' });
    }
    if (amt > parseFloat(inv.balance) + 0.001) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({
        error: `Payment $${amt.toFixed(2)} exceeds remaining balance $${parseFloat(inv.balance).toFixed(2)}`,
      });
    }

    // Canonical payment record
    const payRes = await dbClient.query(
      `INSERT INTO payments (account_id, client_id, amount, method, payment_date, reference, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        req.accountId, inv.client_id, amt, method.toUpperCase(), paymentDate,
        reference.trim() || null, note.trim() || null, req.userId,
      ]
    );
    const paymentId = payRes.rows[0].id;

    // Allocation record (payment → invoice)
    await dbClient.query(
      `INSERT INTO payment_allocations (payment_id, invoice_id, account_id, amount)
       VALUES ($1, $2, $3, $4)`,
      [paymentId, req.params.id, req.accountId, amt]
    );

    // Update invoice balance and status
    const newBalance    = Math.max(0, parseFloat(inv.balance) - amt);
    const newStatus     = newBalance <= 0.001 ? 'paid' : 'partially_paid';
    const paidAt        = newStatus === 'paid' ? new Date().toISOString() : null;
    const combinedNote  = [reference ? `Ref: ${reference}` : null, note || null].filter(Boolean).join(' — ') || null;

    const { rows: updated } = await dbClient.query(
      `UPDATE invoices
       SET balance       = $1,
           status        = $2,
           paid_at       = COALESCE(paid_at, $3),
           paid_method   = COALESCE(paid_method, $4),
           payment_note  = COALESCE(payment_note, $5)
       WHERE id = $6 AND account_id = $7
       RETURNING *`,
      [newBalance, newStatus, paidAt, method, combinedNote, req.params.id, req.accountId]
    );

    if (newStatus === 'paid') {
      await dbClient.query(
        `UPDATE clients SET ltv = ltv + $1 WHERE id = $2 AND account_id = $3`,
        [amt, inv.client_id, req.accountId]
      );
    }

    await dbClient.query('COMMIT');
    res.json({ ...updated[0], payment_id: paymentId });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

module.exports = router;
