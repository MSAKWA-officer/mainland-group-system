const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

/* Writes the Warehouse Inventory Statement in the company's paper format, as Excel (.xlsx) or PDF.
   Both take a list of statements (see warehouseStatement.js): the first sheet / pages are the combined one, then one per warehouse.
   Physical Count is filled from the Physical Count page (the latest count inside the period); the Remark shows the count date.
   A product that was not counted keeps an empty Physical Count: it can still be typed (Excel) or written (PDF) during the stock-take.
   In Excel, Book Balance and Inventory Variance are live formulas, so typing a physical count shows the variance at once. */

// Columns, in order. `key` = field of a statement row, `g` = colour group.
const COLS = [
  { key: 'code', head: 'Product Code', w: 16, g: 'text' },
  { key: 'name', head: 'Product Name', w: 34, g: 'text' },
  { key: 'monthStart', head: 'Month\nStart Qty', w: 11, g: 'grey' },
  { key: 'periodStart', head: 'Period\nStart Qty', w: 11, g: 'grey' },
  { key: 'factoryDelivery', head: 'Factory\nDelivery', w: 11, g: 'in', group: 'Inbound' },
  { key: 'fromVehicle', head: 'From\nVehicle', w: 11, g: 'in', group: 'Inbound' },
  { key: 'salesReturn', head: 'Sales\nReturn', w: 11, g: 'in', group: 'Inbound' },
  { key: 'otherIn', head: 'Other In.', w: 11, g: 'in', group: 'Inbound' },
  { key: 'toVehicle', head: 'To Vehicle', w: 11, g: 'out', group: 'Outbound' },
  { key: 'salesOut', head: 'Sales Out.', w: 11, g: 'out', group: 'Outbound' },
  { key: 'damagedOut', head: 'Damaged\nOut.', w: 11, g: 'out', group: 'Outbound' },
  { key: 'toFactory', head: 'To Factory', w: 11, g: 'out', group: 'Outbound' },
  { key: 'otherOut', head: 'Other Out.', w: 11, g: 'out', group: 'Outbound' },
  { key: 'bookBalance', head: 'Book\nBalance', w: 12, g: 'book' },
  { key: 'physical', head: 'Physical\nCount', w: 12, g: 'phys' },
  { key: 'variance', head: 'Inventory\nVariance', w: 12, g: 'book' },
  { key: 'remark', head: 'Remark', w: 22, g: 'text' },
];
const FILL = { head: '5B8FC7', title: '4A7EBB', text: 'FFFFFF', grey: 'F2F2F2', in: 'EAF3E8', out: 'FDF2EC', book: 'EDEDED', phys: 'EAF0FA' };
const counted = (l) => l.physical !== null && l.physical !== undefined;
const remarkOf = (l) => (counted(l) ? `Counted ${l.countDate}` : '');
const idx = (key) => COLS.findIndex((c) => c.key === key);
const IN_FIRST = idx('factoryDelivery'); const IN_LAST = idx('otherIn'); const OUT_FIRST = idx('toVehicle'); const OUT_LAST = idx('otherOut');

const unitLabel = (s) => s.unit || (s.rows.length ? 'Per product unit' : '-');
const scopeTitle = (s) => `Warehouse Inventory Statement - ${s.title}`;
const safeSheet = (name, used) => {
  let n = name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet';
  let k = 2; while (used.has(n.toLowerCase())) { n = `${n.slice(0, 28)} ${k++}`; }
  used.add(n.toLowerCase()); return n;
};

/* ------------------------------------------------------------------ Excel */
async function toExcel(statements) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mainland Group'; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };   // Excel recalculates Book Balance / Variance when the file is opened
  const used = new Set();
  const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } });
  const NUM = '#,##0.###;-#,##0.###;"-"';
  const col = (i) => { let n = i + 1; let s = ''; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  for (const s of statements) {
    const ws = wb.addWorksheet(safeSheet(s.title, used), {
      views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '3:4' },
    });
    COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });
    const last = col(COLS.length - 1);

    // Row 1: title bar
    ws.mergeCells(`A1:${last}1`);
    const t = ws.getCell('A1'); t.value = scopeTitle(s);
    t.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }; t.alignment = { horizontal: 'center', vertical: 'middle' }; t.fill = fill(FILL.title);
    ws.getRow(1).height = 30;

    // Row 2: period and unit
    ws.getCell('A2').value = 'Statistical Period:'; ws.getCell('A2').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F3F66' } };
    ws.getCell('B2').value = `${s.from}   to   ${s.to}`; ws.getCell('B2').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F3F66' } };
    ws.getCell(`${col(OUT_FIRST)}2`).value = s.warehouse ? `Warehouse: ${s.warehouse.code} - ${s.warehouse.name}` : 'Warehouse: All warehouses (combined)';
    ws.getCell(`${col(OUT_FIRST)}2`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F3F66' } };
    ws.getCell(`${col(COLS.length - 2)}2`).value = `Unit : ${unitLabel(s)}`;
    ws.getCell(`${col(COLS.length - 2)}2`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F3F66' } };
    ws.getRow(2).height = 20;

    // Rows 3-4: two-level header
    COLS.forEach((c, i) => {
      const a = ws.getCell(3, i + 1); const b = ws.getCell(4, i + 1);
      [a, b].forEach((x) => { x.fill = fill(FILL.head); x.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; x.border = box; });
      if (!c.group) { ws.mergeCells(3, i + 1, 4, i + 1); a.value = c.head; }
      else b.value = c.head;
    });
    ws.mergeCells(3, IN_FIRST + 1, 3, IN_LAST + 1); ws.getCell(3, IN_FIRST + 1).value = 'Inbound';
    ws.mergeCells(3, OUT_FIRST + 1, 3, OUT_LAST + 1); ws.getCell(3, OUT_FIRST + 1).value = 'Outbound';
    ws.getRow(3).height = 20; ws.getRow(4).height = 30;

    // Data rows
    const first = 5; const lastData = first + s.rows.length - 1;
    const book = col(idx('bookBalance')); const phys = col(idx('physical')); const varc = col(idx('variance'));
    s.rows.forEach((l, n) => {
      const r = first + n; const row = ws.getRow(r);
      COLS.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.fill = fill(FILL[c.g]); cell.border = box; cell.font = { name: 'Arial', size: 10 };
        if (c.key === 'code' || c.key === 'name') { cell.value = l[c.key]; cell.alignment = { vertical: 'middle' }; return; }
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        if (c.key === 'remark') { cell.alignment = { vertical: 'middle' }; if (counted(l)) cell.value = remarkOf(l); return; }
        if (c.key === 'physical') { cell.numFmt = NUM; if (counted(l)) cell.value = l.physical; return; }
        cell.numFmt = NUM;
        if (c.key === 'bookBalance') {
          cell.value = { formula: `${col(idx('periodStart'))}${r}+SUM(${col(IN_FIRST)}${r}:${col(IN_LAST)}${r})-SUM(${col(OUT_FIRST)}${r}:${col(OUT_LAST)}${r})`, result: l.bookBalance };
          cell.font = { name: 'Arial', size: 10, bold: true };
        } else if (c.key === 'variance') {
          // Live formula (typing a count updates it). Only when several warehouses were counted partly, the saved difference is written instead.
          const same = counted(l) && Math.abs((l.physical - l.bookBalance) - l.variance) < 0.0005;
          if (counted(l) && !same) cell.value = l.variance;
          else cell.value = { formula: `IF(${phys}${r}="","",${phys}${r}-${book}${r})`, result: counted(l) ? l.variance : '' };
        } else cell.value = l[c.key];
      });
      row.height = 18;
    });

    // Totals
    const tr = lastData + 1; const trow = ws.getRow(tr);
    COLS.forEach((c, i) => {
      const cell = trow.getCell(i + 1); cell.border = box; cell.fill = fill('DDE7F3'); cell.font = { name: 'Arial', size: 10, bold: true };
      cell.alignment = { horizontal: c.key === 'name' || c.key === 'code' ? 'left' : 'right', vertical: 'middle' }; cell.numFmt = NUM;
      if (c.key === 'code') cell.value = 'TOTAL';
      else if (s.rows.length && !['name', 'remark'].includes(c.key)) {
        const rng = `${col(i)}${first}:${col(i)}${lastData}`;
        if (c.key === 'physical') cell.value = { formula: `IF(COUNT(${rng})=0,"",SUM(${rng}))`, result: s.totals.physical ?? '' };
        else if (c.key === 'variance') cell.value = { formula: `IF(COUNT(${rng})=0,"",SUM(${rng}))`, result: s.totals.variance ?? '' };
        else cell.value = { formula: `SUM(${rng})`, result: s.totals[c.key] };
      }
    });
    trow.height = 20;
    if (!s.rows.length) { ws.mergeCells(first, 1, first, COLS.length); ws.getCell(first, 1).value = 'No products.'; }

    // Notes
    const nr = tr + 2;
    ws.getCell(nr, 1).value = 'Book Balance = Period Start Qty + Inbound - Outbound. Inventory Variance = Physical Count - Book Balance. Physical Count = latest count recorded in the period (see the Remark for its date); products not counted can be filled in by hand.';
    ws.getCell(nr + 1, 1).value = `Month Start Qty = quantity at the start of ${s.monthStart}. Other In. / Other Out. include stock adjustments and expired write-offs. Generated ${new Date(s.generatedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC.`;
    [nr, nr + 1].forEach((r) => { ws.getCell(r, 1).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF595959' } }; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* -------------------------------------------------------------------- PDF */
function toPdf(statements) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 20, bufferPages: true, info: { Title: 'Warehouse Inventory Statement', Author: 'Mainland Group' } });
    const chunks = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);

    const M = 20; const W = doc.page.width - M * 2; const H = doc.page.height;
    const rel = { code: 9, name: 19, monthStart: 6.2, periodStart: 6.2, factoryDelivery: 6.2, fromVehicle: 6.2, salesReturn: 6.2, otherIn: 6.2,
      toVehicle: 6.2, salesOut: 6.2, damagedOut: 6.2, toFactory: 6.2, otherOut: 6.2, bookBalance: 6.6, physical: 7, variance: 7, remark: 10 };
    const tot = COLS.reduce((a, c) => a + rel[c.key], 0);
    const widths = COLS.map((c) => (rel[c.key] / tot) * W);
    const xs = widths.reduce((a, w, i) => { a.push(i ? a[i - 1] + widths[i - 1] : M); return a; }, []);
    const ROW = 15; const HEAD1 = 16; const HEAD2 = 26; const FOOT = 22;
    const color = (hex) => `#${hex}`; const BORDER = '#BFBFBF';
    const num = (v) => (!v ? '-' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 }));

    const cell = (x, y, w, h, bg, text, o = {}) => {
      doc.rect(x, y, w, h).fillAndStroke(bg, BORDER);
      if (text === undefined || text === '') return;
      doc.fillColor(o.color || '#212121').font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.size || 7);
      const lines = String(text).split('\n').length;
      const th = lines * (o.size || 7) * 1.15;
      doc.text(String(text), x + 2, y + Math.max(1.5, (h - th) / 2), { width: w - 4, height: h, align: o.align || 'left', lineBreak: lines > 1, ellipsis: true });
    };

    const header = (s, y) => {
      doc.rect(M, y, W, 24).fill(color(FILL.title));
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13).text(scopeTitle(s), M, y + 6, { width: W, align: 'center' });
      y += 28;
      doc.fillColor('#1F3F66').font('Helvetica-Bold').fontSize(8)
        .text(`Statistical Period:  ${s.from}  to  ${s.to}`, M, y, { continued: false })
        .text(s.warehouse ? `Warehouse: ${s.warehouse.code} - ${s.warehouse.name}` : 'Warehouse: All warehouses (combined)', M, y, { width: W, align: 'center' })
        .text(`Unit : ${unitLabel(s)}`, M, y, { width: W, align: 'right' });
      y += 13;
      COLS.forEach((c, i) => {
        if (!c.group) cell(xs[i], y, widths[i], HEAD1 + HEAD2, color(FILL.head), c.head, { bold: true, color: '#FFFFFF', align: 'center' });
        else cell(xs[i], y + HEAD1, widths[i], HEAD2, color(FILL.head), c.head, { bold: true, color: '#FFFFFF', align: 'center' });
      });
      [['Inbound', IN_FIRST, IN_LAST], ['Outbound', OUT_FIRST, OUT_LAST]].forEach(([label, a, b]) => {
        cell(xs[a], y, xs[b] + widths[b] - xs[a], HEAD1, color(FILL.head), label, { bold: true, color: '#FFFFFF', align: 'center', size: 8 });
      });
      return y + HEAD1 + HEAD2;
    };

    const bodyRow = (l, y, bold) => COLS.forEach((c, i) => {
      const bg = bold ? 'DDE7F3' : FILL[c.g];
      if (c.key === 'code' || c.key === 'name') cell(xs[i], y, widths[i], ROW, color(bg), bold && c.key === 'name' ? '' : l[c.key], { bold });
      else if (c.key === 'remark') cell(xs[i], y, widths[i], ROW, color(bg), bold ? '' : remarkOf(l), { size: 6 });
      else if (c.key === 'physical' || c.key === 'variance') cell(xs[i], y, widths[i], ROW, color(bg), l[c.key] === null || l[c.key] === undefined ? '' : (l[c.key] === 0 ? '0' : num(l[c.key])), { align: 'right', bold });
      else cell(xs[i], y, widths[i], ROW, color(bg), num(l[c.key]), { align: 'right', bold: bold || c.key === 'bookBalance' });
    });

    statements.forEach((s, n) => {
      if (n > 0) doc.addPage();
      let y = header(s, M);
      const limit = H - M - FOOT;
      if (!s.rows.length) { cell(M, y, W, ROW, '#FFFFFF', 'No products.'); return; }
      for (const l of s.rows) {
        if (y + ROW * 2 > limit) { doc.addPage(); y = header(s, M); }
        bodyRow(l, y, false); y += ROW;
      }
      if (y + ROW > limit) { doc.addPage(); y = header(s, M); }
      bodyRow({ ...s.totals, code: 'TOTAL', name: '' }, y, true);
    });

    // Footer on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.fillColor('#595959').font('Helvetica-Oblique').fontSize(6.5)
        .text('Book Balance = Period Start Qty + Inbound - Outbound.   Inventory Variance = Physical Count - Book Balance (Physical Count = latest count in the period).   Other In./Other Out. include adjustments and expired write-offs.',
          M, H - M - 12, { width: W - 80, lineBreak: false })
        .text(`Page ${i + 1} of ${range.count}`, M, H - M - 12, { width: W, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { toExcel, toPdf };
