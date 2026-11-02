const ExcelJS = require('exceljs');

// The "Official Vehicle Use REQUEST Form" (车辆使用申请表) as an Excel register for one month, in the same layout as the paper form:
// the grey Approver's Signature column and the Driver's Signature column are left empty for hand signing.
const COLS = [
  ['日期', 'Date', 12], ['用车人', "User's Name", 18], ['部门', 'Department', 16], ['用车理由', 'Purpose', 34], ['用车人签字', "User's Signature", 16],
  ['审批人签字', "Approver's Signature", 16], ['车牌号', 'Plate Number', 14], ['司机', "Driver's Name", 18], ['领取钥匙时间', 'Key Taken Time', 15], ['归还钥匙时间', 'Key Return Time', 15], ['司机签字', "Driver's Signature", 16],
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const thin = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

async function toXlsx(reg, minRows = 25) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Vehicle requests', { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });
  ws.mergeCells(1, 1, 1, 11); const title = ws.getCell('A1');
  title.value = '车辆使用申请表|Official Vehicle Use REQUEST Form'; title.font = { bold: true, size: 16 }; title.alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(1).height = 28;
  ws.mergeCells(3, 1, 3, 3); ws.mergeCells(3, 7, 3, 9);
  ws.getCell('A3').value = `月份|Month:  ${MONTHS[reg.monthNo - 1]}`; ws.getCell('G3').value = `年份|Year:  ${reg.year}`;
  for (const a of ['A3', 'G3']) ws.getCell(a).font = { bold: true, size: 10 };

  ws.mergeCells(5, 1, 5, 5); ws.mergeCells(5, 7, 5, 10);
  ws.getCell('A5').value = 'Information for Vehicle User filling in |车辆使用人填写信息'; ws.getCell('G5').value = 'Information for Key Custodian filling in | 钥匙保管人填写信息';
  ws.mergeCells(5, 6, 6, 6); ws.mergeCells(5, 11, 6, 11);
  ws.getCell('F5').value = "审批人签字\nApprover's Signature"; ws.getCell('K5').value = "司机签字\nDriver's Signature";
  for (let c = 1; c <= 11; c++) {
    const a = ws.getCell(5, c); a.font = { bold: true, size: 9 }; a.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; a.border = BORDER; if (c === 6) a.fill = fill('FFE7E6E6');
    const h = ws.getCell(6, c); h.border = BORDER;
    if (c !== 6 && c !== 11) { h.value = `${COLS[c - 1][0]}\n${COLS[c - 1][1]}`; h.font = { bold: true, size: 9 }; h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; }
  }
  ws.getRow(5).height = 22; ws.getRow(6).height = 36;

  const rows = reg.rows.map((r) => [dmy(r.date), r.userName, r.department, r.purpose, null, null, r.plateNo, r.driverName, r.keyTaken, r.keyReturned, null]);
  while (rows.length < minRows) rows.push(Array(11).fill(null));
  rows.forEach((vals, i) => {
    const row = ws.getRow(7 + i); row.height = 26;
    vals.forEach((v, c) => { const cell = row.getCell(c + 1); cell.value = v; cell.border = BORDER; cell.font = { size: 10 }; if (c === 5) cell.fill = fill('FFE7E6E6');
      cell.alignment = { horizontal: [1, 2, 3].includes(c) ? 'left' : 'center', vertical: 'middle', wrapText: true }; });
  });
  ws.views = [{ state: 'frozen', ySplit: 6 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
module.exports = { toXlsx };
