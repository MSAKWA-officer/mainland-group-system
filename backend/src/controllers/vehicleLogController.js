const svc = require('../services/vehicleLog');
const audit = require('../services/audit');
const { AppError } = require('../utils/errors');
const { toXlsx } = require('../utils/vehicleLogSheetXlsx');

exports.list = async (req, res) => res.json(await svc.list(req.query));
exports.getOne = async (req, res) => res.json(await svc.getOne(req.params.id));
exports.create = async (req, res) => res.status(201).json(await svc.getOne(await svc.create(req, req.body)));
exports.update = async (req, res) => res.json(await svc.getOne(await svc.update(req, req.params.id, req.body)));
exports.void = async (req, res) => res.json(await svc.getOne(await svc.void(req, req.params.id, req.body.reason)));

// JSON by default; ?format=xlsx sends the Excel form (needs vehicle_log.export) and writes the download to the audit log.
exports.sheet = async (req, res) => {
  const out = await svc.logSheet(req.query);
  if (req.query.format !== 'xlsx') return res.json(out);
  if (!req.user.permissions.has('vehicle_log.export')) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to export the vehicle log');
  await audit.log(req, { action: 'VEHICLE_LOG_EXPORTED', entityType: 'VehicleLog', entityId: out.vehicle.id, newValues: { month: out.month, plateNo: out.vehicle.plateNo, rows: out.rows.length } });
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="vehicle-log-${out.vehicle.plateNo.replace(/[^A-Za-z0-9-]/g, '')}-${out.month}.xlsx"`, 'Cache-Control': 'no-store' });
  res.send(await toXlsx(out));
};
