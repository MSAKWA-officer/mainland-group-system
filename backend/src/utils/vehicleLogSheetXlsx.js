const ExcelJS = require('exceljs');

// The "Official Vehicle USE and FUELING Registration Form" (车辆使用和加油登记表) as an Excel file, same columns and bands as the paper form.
// Blank rows are added up to `minRows` so the sheet can still be filled in by hand when printed.
const COLS = [
  ['日期', 'Date', 10], ['用车人', "User's Name", 18], ['用车理由', 'Purpose', 30], ['开始时间', 'Time Starting', 11], ['开始里程', 'Initial Mileage', 11],
  ['结束时间', 'Time Ending', 11], ['结束里程', 'Final Mileage', 11], ['里程合计', 'Total Mileage', 11], ['用车人签字', "User's Signature", 16],
  ['加油时里程', 'Mileage when Fueling', 14], ['加油量/升', 'Fuel Qty. /L', 11], ['支付方式', 'Cash/Card', 11], ['发票号', 'Receipt No.', 14], ['加油人签名', "Refuler's Signature", 16],
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const thin = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
const num = (v, dp) => (v == null ? null : Number(Number(v).toFixed(dp)));

async function toXlsx(sheet, minRows = 31) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Vehicle log', { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });
  const merge = (r, a, b) => ws.mergeCells(r, a, r, b);

  merge(1, 1, 14); const title = ws.getCell('A1');
  title.value = '车辆使用和加油登记表|Official Vehicle USE and FUELING Registration Form'; title.font = { bold: true, size: 16 }; title.alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(1).height = 28;

  merge(3, 1, 4); merge(3, 6, 8); merge(3, 11, 14);
  ws.getCell('A3').value = `车牌号|Vehicle Plate Number:  ${sheet.vehicle.plateNo}`;
  ws.getCell('F3').value = `月份|Month:  ${MONTHS[sheet.monthNo - 1]}`;
  ws.getCell('K3').value = `年份|Year:  ${sheet.year}`;
  for (const a of ['A3', 'F3', 'K3']) ws.getCell(a).font = { bold: true, size: 10 };

  merge(5, 1, 9); merge(5, 10, 14);
  ws.getCell('A5').value = '车辆使用登记\nOfficial Vehicle USE Registration'; ws.getCell('J5').value = '加油登记\nFUELING Registration';
  merge(6, 1, 9); merge(6, 10, 14);
  ws.getCell('A6').value = 'Information for Vehicle User filling in |车辆使用人填写信息'; ws.getCell('J6').value = 'Information for Refueler filling in | 加油者填写信息';
  for (let c = 1; c <= 14; c++) {
    const a = ws.getCell(5, c); a.fill = fill('FFFFFF00'); a.font = { bold: true, size: 10 }; a.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; a.border = BORDER;
    const b = ws.getCell(6, c); b.fill = fill('FFBDD7EE'); b.font = { bold: true, size: 9 }; b.alignment = { horizontal: 'center', vertical: 'middle' }; b.border = BORDER;
    const h = ws.getCell(7, c); h.value = `${COLS[c - 1][0]}\n${COLS[c - 1][1]}`; h.font = { bold: true, size: 9 }; h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; h.border = BORDER;
  }
  ws.getRow(5).height = 32; ws.getRow(6).height = 20; ws.getRow(7).height = 34;

  const rows = sheet.rows.map((r) => [dmy(r.date), r.userName, r.purpose, r.timeStart, num(r.startKm, 1), r.timeEnd, num(r.endKm, 1), num(r.totalKm, 1), null,
    num(r.fuelOdometerKm, 1), num(r.litres, 3), r.paymentMethod === 'CASH' ? 'Cash' : r.paymentMethod === 'CARD' ? 'Card' : null, r.receiptNo, null]);
  while (rows.length < minRows) rows.push(Array(14).fill(null));
  rows.forEach((vals, i) => {
    const row = ws.getRow(8 + i); row.height = 24;
    vals.forEach((v, c) => { const cell = row.getCell(c + 1); cell.value = v; cell.border = BORDER; cell.font = { size: 10 }; cell.alignment = { horizontal: c === 1 || c === 2 ? 'left' : 'center', vertical: 'middle', wrapText: true }; });
  });
  const t = ws.getRow(8 + rows.length); t.height = 22;
  for (let c = 1; c <= 14; c++) { const cell = t.getCell(c); cell.border = BORDER; cell.font = { bold: true, size: 10 }; cell.fill = fill('FFF2F2F2'); cell.alignment = { horizontal: 'center', vertical: 'middle' }; }
  t.getCell(1).value = 'Total'; t.getCell(8).value = num(sheet.totals.totalKm, 1); t.getCell(11).value = num(sheet.totals.litres, 3);
  ws.views = [{ state: 'frozen', ySplit: 7 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
module.exports = { toXlsx };
