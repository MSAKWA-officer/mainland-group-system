const svc = require('../services/efdReports');
const audit = require('../services/audit');
const { toCsv } = require('../utils/csv');

// JSON by default. With ?format=csv the same report is sent as a file (the route has already checked efd_reports.export) and the download is written to the audit log.
const respond = (name) => async (req, res) => {
  const csv = req.query.format === 'csv';
  const out = await svc[name](req.query, csv ? { all: true } : undefined);
  if (!csv) return res.json(out);
  await audit.log(req, { action: 'EFD_REPORT_EXPORTED', entityType: 'EfdReport', entityId: name,
    newValues: { from: req.query.from ?? null, to: req.query.to ?? null, year: req.query.year ?? null, deviceId: req.query.deviceId ?? null, rows: out.rows.length } });
  const tag = req.query.year ?? `${req.query.from}_${req.query.to}`;
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="efd-${name}-${tag}.csv"`, 'Cache-Control': 'no-store' });
  return res.send(toCsv(out.columns, out.rows));
};

exports.daily = respond('daily');
exports.devices = respond('devices');
exports.monthly = respond('monthly');
exports.receipts = respond('receipts');
exports.unreceipted = respond('unreceipted');
