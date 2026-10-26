const ExcelJS = require('exceljs');

/* Sales reports as Excel, in the company's "Daily sales report" layout:
   navy title bar, dark-blue header row with filter arrows, bordered rows, the Total column shaded light blue, a TOTAL row at the bottom.
   TOTAL uses SUBTOTAL, so the totals follow the Excel filters. Dates, quantities and amounts are real numbers (not text). */
// Colours taken from the company template: title bar 17365D, header 1F4E78, Total column EAF2F8, black cell borders.
const NAVY = 'FF17365D'; const HEAD = 'FF1F4E78'; const SHADE = 'FFEAF2F8';
const SHADED_KEYS = new Set(['total', 'value']);
const line = { style: 'thin', color: { argb: 'FF000000' } };
const BOX = { top: line, left: line, bottom: line, right: line };
const FMT = { money: '#,##0.00', count: '#,##0', qty: '#,##0.###', date: 'dd/mm/yyyy' };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const letter = (i) => { let n = i + 1; let s = ''; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dmy = (d) => d.split('-').reverse().join('/');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function titleOf(r) {
  if (r.report === 'detail') {
    const [fy, fm, fd] = r.from.split('-').map(Number); const [ty, tm, td] = r.to.split('-').map(Number);
    if (r.from === r.to) return 'DAILY SALES REPORT';
    if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) return 'YEARLY SALES REPORT';
    if (fy === ty && fm === tm && fd === 1 && td === lastDay(ty, tm)) return 'MONTHLY SALES REPORT';
    return 'SALES REPORT';
  }
  if (r.report === 'summary') return `${{ day: 'DAILY', month: 'MONTHLY', year: 'YEARLY' }[r.groupBy] || 'DAILY'} SALES SUMMARY`;
  return { salespersons: 'SALES SUMMARY BY SALESPERSON', customers: 'SALES SUMMARY BY CUSTOMER', products: 'SALES SUMMARY BY PRODUCT' }[r.report] || 'SALES REPORT';
}
const headLabel = (c) => {
  if (c.type !== 'money' || /TZS/.test(c.label)) return c.label;
  return c.label.includes('(') ? c.label.replace(/\)\s*$/, ', TZS)') : `${c.label} (TZS)`;
};
const cellValue = (c, v) => {
  if (v === null || v === undefined || v === '') return null;
  if (['money', 'count', 'qty'].includes(c.type)) return Number(v);
  if (typeof v === 'string' && DATE.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  return String(v);
};

async function toXlsx(report) {
  const { columns, rows, totals } = report; const n = columns.length;
  const wb = new ExcelJS.Workbook(); wb.creator = 'Mainland Group'; wb.created = new Date();
  const ws = wb.addWorksheet('Sales report', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:3' },
  });
  columns.forEach((c, i) => {
    const longest = rows.reduce((m, r) => Math.max(m, String(r[c.key] ?? '').length), 0);
    ws.getColumn(i + 1).width = c.type === 'text' ? Math.min(46, Math.max(c.key === 'date' ? 13 : 16, longest + 3, headLabel(c).length + 4)) : c.type === 'money' ? 20 : 13;
  });

  // Row 1: title bar. Row 2: period + sale types.
  ws.mergeCells(1, 1, 1, n);
  const t = ws.getCell(1, 1); t.value = titleOf(report);
  t.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }; t.alignment = { horizontal: 'center', vertical: 'middle' }; t.fill = fill(NAVY);
  ws.getRow(1).height = 30;
  const info = ws.getCell(2, 1);
  info.value = `Period: ${dmy(report.from)} to ${dmy(report.to)}     Sales: ${(report.types || []).join(' + ') || '-'}`;
  info.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF404040' } };
  ws.getRow(2).height = 16;

  // Row 3: header
  columns.forEach((c, i) => {
    const h = ws.getCell(3, i + 1); h.value = headLabel(c);
    h.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = fill(HEAD); h.border = BOX;
    h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  ws.getRow(3).height = 36;

  // Data
  const first = 4; const last = first + rows.length - 1;
  rows.forEach((r, k) => {
    const row = ws.getRow(first + k);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1); const v = cellValue(c, r[c.key]);
      cell.value = v; cell.border = BOX; cell.font = { name: 'Calibri', size: 11 };
      if (SHADED_KEYS.has(c.key)) cell.fill = fill(SHADE);
      if (v instanceof Date) { cell.numFmt = FMT.date; cell.alignment = { horizontal: 'center', vertical: 'middle' }; }
      else if (c.type === 'text') cell.alignment = { vertical: 'middle' };
      else { cell.numFmt = FMT[c.type]; cell.alignment = { horizontal: 'right', vertical: 'middle' }; }
    });
    row.height = 20;
  });

  if (!rows.length) {
    ws.mergeCells(first, 1, first, n); const e = ws.getCell(first, 1); e.value = 'No completed sales in this period.'; e.border = BOX; e.font = { name: 'Calibri', size: 11, italic: true };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // TOTAL row (follows the filters)
  const tr = ws.getRow(last + 1);
  columns.forEach((c, i) => {
    const cell = tr.getCell(i + 1); cell.border = BOX; cell.font = { name: 'Calibri', size: 11, bold: true }; if (SHADED_KEYS.has(c.key)) cell.fill = fill(SHADE);
    if (i === 0) { cell.value = 'TOTAL'; return; }
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    if (totals && totals[c.key] !== undefined && c.type !== 'text') {
      cell.value = { formula: `SUBTOTAL(109,${letter(i)}${first}:${letter(i)}${last})`, result: Number(totals[c.key]) }; cell.numFmt = FMT[c.type];
    }
  });
  tr.height = 20;
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: last, column: n } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { toXlsx, titleOf, headLabel, dmy, SHADED_KEYS };
