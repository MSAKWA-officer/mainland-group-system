const audit = require('../services/audit');
const { toCsv } = require('./csv');
const { toXlsx } = require('./salesReportXlsx');
const { toPdf } = require('./salesReportPdf');

/* Shared by the Payments reports and Customer balance reports controllers (same behaviour as salesReportController).
   JSON by default. With ?format=xlsx | pdf | csv the same report is sent as a file (the route already checked <module>.export) and the download is written to the audit log. */
const EXPORTS = ['csv', 'xlsx', 'pdf'];
const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8' };

module.exports = ({ svc, file, entityType, action }) => (name) => async (req, res) => {
  const out = await svc[name](req, req.query);
  const fmt = req.query.format;
  if (!EXPORTS.includes(fmt)) return res.json({ ...out, reportTitle: out.exportTitle });
  const filters = Object.fromEntries(Object.entries(req.query).filter(([k, v]) => k !== 'format' && v !== undefined && v !== ''));
  await audit.log(req, { action, entityType, entityId: name, newValues: { format: fmt, ...filters, rows: out.rows.length } });
  const tag = out.from && out.to ? `${out.from}_${out.to}` : out.asOf;
  res.set({ 'Content-Type': MIME[fmt], 'Content-Disposition': `attachment; filename="${file}-${name}-${tag}.${fmt}"`, 'Cache-Control': 'no-store' });
  if (fmt === 'pdf') return res.send(await toPdf(out));
  if (fmt === 'xlsx') return res.send(await toXlsx(out));
  return res.send(toCsv(out.columns, out.rows));
};
