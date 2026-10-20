const { AppError } = require('../utils/errors');
const wh = require('../services/warehouses');
const audit = require('../services/audit');
const stmt = require('../services/warehouseStatement');
const exporter = require('../services/warehouseStatementExport');

/* Warehouse Inventory Statement (opening, inbound, outbound, book balance) for all warehouses together or one warehouse.
   A storekeeper / salesperson only gets the warehouses they work in; Managers and the Owner get everything.
   Dates are YYYY-MM-DD, `to` is inclusive. Default period = this month so far. */
const period = (q) => {
  const to = q.to || stmt.todayLocal();
  const from = q.from || stmt.monthStartOf(to);
  if (from > to) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'from', message: 'Start date must not be after the end date' }]);
  return { from, to };
};

// Resolves who may see what, then builds the statements. `each` = also one statement per warehouse (used by the downloads).
const make = async (req, each) => {
  const { warehouseId } = req.query;
  if (warehouseId) await wh.access(req, warehouseId);       // 404 / 403 when it is not the user's warehouse
  const allowed = warehouseId ? null : await wh.scope(req);
  const { from, to } = period(req.query);
  return stmt.statements({ allowed, warehouseId, from, to, each });
};

// On-screen preview: ONE statement (the combined one, or the chosen warehouse).
exports.preview = async (req, res) => {
  const [s] = await make(req, false);
  res.json(s);
};

exports.download = async (req, res) => {
  const { format } = req.query;
  const list = await make(req, true);
  const buf = format === 'pdf' ? await exporter.toPdf(list) : await exporter.toExcel(list);
  const first = list[0];
  const who = req.query.warehouseId && first.warehouse ? first.warehouse.code : 'ALL';
  const name = `warehouse-inventory-statement_${who}_${first.from}_${first.to}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
  await audit.log(req, { action: 'WAREHOUSE_STATEMENT_EXPORTED', entityType: 'Report', entityId: 'warehouse-statement',
    newValues: { format: format === 'pdf' ? 'pdf' : 'xlsx', scope: who, from: first.from, to: first.to, statements: list.length } });
  res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
};
