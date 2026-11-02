const svc = require('../services/vehicleRequests');
const audit = require('../services/audit');
const { toXlsx } = require('../utils/vehicleRequestXlsx');

const one = (fn) => async (req, res) => res.json(await svc.getOne(req, await fn(req)));
exports.list = async (req, res) => res.json(await svc.list(req, req.query));
exports.getOne = async (req, res) => res.json(await svc.getOne(req, req.params.id));
exports.create = async (req, res) => res.status(201).json(await svc.getOne(req, await svc.create(req, req.body)));
exports.update = one((req) => svc.update(req, req.params.id, req.body));
exports.approve = one((req) => svc.approve(req, req.params.id, req.body.note));
exports.reject = one((req) => svc.reject(req, req.params.id, req.body.note));
exports.issueKey = one((req) => svc.issueKey(req, req.params.id, req.body));
exports.returnKey = one((req) => svc.returnKey(req, req.params.id, req.body));
exports.void = one((req) => svc.void(req, req.params.id, req.body.reason));

// JSON by default; ?format=xlsx sends the Excel form (the route already checked vehicle_requests.export) and writes the download to the audit log.
exports.register = async (req, res) => {
  const out = await svc.register(req, req.query);
  if (req.query.format !== 'xlsx') return res.json(out);
  await audit.log(req, { action: 'VEHICLE_REQUESTS_EXPORTED', entityType: 'VehicleRequestRegister', entityId: out.month, newValues: { month: out.month, rows: out.rows.length } });
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="vehicle-requests-${out.month}.xlsx"`, 'Cache-Control': 'no-store' });
  res.send(await toXlsx(out));
};
