const PDFDocument = require('pdfkit');
const { titleOf, headLabel, dmy, SHADED_KEYS } = require('./salesReportXlsx');

/* Sales reports as PDF (A4 landscape), same look as the Excel file and the company template:
   navy title bar, dark-blue header row (repeated on every page), black cell borders, Total column shaded light blue, TOTAL row on the last page, "Page x of y" footer.
   The built-in PDF font has no Chinese / emoji glyphs, so such characters print as "?". */
const NAVY = '#17365D'; const HEAD = '#1F4E78'; const SHADE = '#EAF2F8';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const safe = (v) => String(v ?? '').replace(/[^\u0000-\u00FF]/g, '?');
const nf = (min, max) => (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
const FMT = { money: nf(2, 2), count: nf(0, 0), qty: nf(0, 3) };
const show = (c, v) => {
  if (v === null || v === undefined || v === '') return '';
  if (FMT[c.type]) return FMT[c.type](v);
  return DATE.test(v) ? dmy(v) : safe(v);
};

function toPdf(report) {
  const { columns, rows, totals } = report; const n = columns.length;
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 20, bufferPages: true, info: { Title: titleOf(report), Author: 'Mainland Group' } });
  const chunks = []; doc.on('data', (b) => chunks.push(b));
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });

  const M = 20; const W = doc.page.width - M * 2; const BOTTOM = doc.page.height - M - 14;
  const ROW = 16; const HEAD_H = 28; const TITLE_H = 26;
  // Column widths: text columns follow their longest value, numbers get a fixed width; then everything is scaled to the page width.
  const want = columns.map((c) => {
    if (c.type === 'money') return 80; if (c.type === 'qty' || c.type === 'count') return 52;
    const longest = rows.reduce((m, r) => Math.max(m, show(c, r[c.key]).length), headLabel(c).length * 0.8);
    return Math.min(190, Math.max(c.key === 'date' ? 58 : 64, longest * 4.3 + 10));
  });
  const k = W / want.reduce((a, b) => a + b, 0); const w = want.map((x) => x * k);
  const x0 = columns.map((_, i) => M + w.slice(0, i).reduce((a, b) => a + b, 0));

  const cellText = (text, x, y, width, h, o = {}) => {
    doc.fillColor(o.color || '#000000').font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.size || 8)
      .text(text, x + 3, y + (h - (o.size || 8)) / 2 - 0.5, { width: width - 6, height: h, align: o.align || 'left', lineBreak: false, ellipsis: true });
  };
  const box = (x, y, width, h, fillColor) => { doc.rect(x, y, width, h); if (fillColor) doc.fillAndStroke(fillColor, '#000000'); else doc.lineWidth(0.5).strokeColor('#000000').stroke(); doc.lineWidth(0.5); };

  const header = () => {
    let y = M;
    doc.rect(M, y, W, TITLE_H).fill(NAVY);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(14).text(titleOf(report), M, y + 7, { width: W, align: 'center', lineBreak: false });
    y += TITLE_H;
    doc.fillColor('#404040').font('Helvetica-Oblique').fontSize(8)
      .text(`Period: ${dmy(report.from)} to ${dmy(report.to)}     Sales: ${(report.types || []).join(' + ') || '-'}`, M, y + 4, { width: W, lineBreak: false });
    y += 16;
    columns.forEach((c, i) => {
      box(x0[i], y, w[i], HEAD_H, HEAD);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text(safe(headLabel(c)), x0[i] + 3, y + 4, { width: w[i] - 6, height: HEAD_H - 6, align: 'center', ellipsis: true });
    });
    return y + HEAD_H;
  };

  let y = header();
  if (!rows.length) {
    box(M, y, W, ROW);
    cellText('No completed sales in this period.', M, y, W, ROW, { size: 8 });
  }
  rows.forEach((r) => {
    if (y + ROW > BOTTOM) { doc.addPage(); y = header(); }
    columns.forEach((c, i) => {
      box(x0[i], y, w[i], ROW, SHADED_KEYS.has(c.key) ? SHADE : null);
      cellText(show(c, r[c.key]), x0[i], y, w[i], ROW, { align: c.type === 'text' ? (DATE.test(r[c.key]) ? 'center' : 'left') : 'right' });
    });
    y += ROW;
  });
  if (rows.length) {
    if (y + ROW > BOTTOM) { doc.addPage(); y = header(); }
    columns.forEach((c, i) => {
      box(x0[i], y, w[i], ROW, SHADED_KEYS.has(c.key) ? SHADE : null);
      const v = i === 0 ? 'TOTAL' : (totals && totals[c.key] !== undefined && c.type !== 'text' ? show(c, totals[c.key]) : '');
      cellText(v, x0[i], y, w[i], ROW, { bold: true, align: i === 0 ? 'left' : 'right' });
    });
  }

  // Footer on every page ("Page x of y"); the bottom margin is lifted so writing there never starts a new page.
  const range = doc.bufferedPageRange();
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(range.start + p); doc.page.margins.bottom = 0;
    doc.fillColor('#595959').font('Helvetica').fontSize(7)
      .text(`Mainland Group   |   Generated ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC   |   Page ${p + 1} of ${range.count}`, M, doc.page.height - 16, { width: W, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

module.exports = { toPdf };
