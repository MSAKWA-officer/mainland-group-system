const svc = require('../services/salesReports');
const audit = require('../services/audit');
const { toCsv } = require('../utils/csv');
const { toXlsx, titleOf } = require('../utils/salesReportXlsx');
const { toPdf } = require('../utils/salesReportPdf');

// JSON by default. With ?format=xlsx (Excel), ?format=pdf (print) - both in the company layout - or ?format=csv the same report is sent as a file (the route already checked sales_reports.export) and the download is written to the audit log.
const respond = (name) => async (req, res) => {
  const out = await svc[name](req, req.query);
  if (!['csv', 'xlsx', 'pdf'].includes(req.query.format)) return res.json({ ...out, reportTitle: titleOf(out) });
  await audit.log(req, { action: 'SALES_REPORT_EXPORTED', entityType: 'SalesReport', entityId: name,
    newValues: { format: req.query.format, from: req.query.from, to: req.query.to, saleType: req.query.saleType ?? null, salespersonId: req.query.salespersonId ?? null, rows: out.rows.length } });
  if (req.query.format === 'pdf') {
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="sales-${name}-${req.query.from}_${req.query.to}.pdf"`, 'Cache-Control': 'no-store' });
    return res.send(await toPdf(out));
  }
  if (req.query.format === 'xlsx') {
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="sales-${name}-${req.query.from}_${req.query.to}.xlsx"`, 'Cache-Control': 'no-store' });
    return res.send(await toXlsx(out));
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="sales-${name}-${req.query.from}_${req.query.to}.csv"`, 'Cache-Control': 'no-store' });
  return res.send(toCsv(out.columns, out.rows));
};
exports.detail = respond('detail');
exports.summary = respond('summary');
exports.salespersons = respond('salespersons');
exports.customers = respond('customers');
exports.products = respond('products');
