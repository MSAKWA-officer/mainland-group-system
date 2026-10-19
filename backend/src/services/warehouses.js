const { Warehouse, WarehouseStorekeeper } = require('../models');
const { AppError } = require('../utils/errors');

/* Who may use which warehouse.
   - `warehouses.read_all` (Manager, Owner): every warehouse.
   - everybody else: only the warehouses they are assigned to as storekeeper (warehouse_storekeepers).
   The API enforces this on every route; the frontend only hides things for convenience. */
const seesAll = (req) => req.user.permissions.has('warehouses.read_all');

// null = no restriction, otherwise the list of warehouse ids this user is in charge of.
const scope = async (req, t) => (seesAll(req) ? null
  : (await WarehouseStorekeeper.findAll({ where: { userId: req.user.id }, attributes: ['warehouseId'], transaction: t })).map((r) => r.warehouseId));

// Loads a warehouse the user may use. { active: true } also requires it to be active (receiving into it, transferring out of it, ...).
async function access(req, id, t, { active = false } = {}) {
  const w = await Warehouse.findByPk(id, { transaction: t });
  if (!w) throw new AppError(404, 'NOT_FOUND', 'Warehouse not found');
  if (!seesAll(req)) {
    const mine = await WarehouseStorekeeper.findOne({ where: { warehouseId: id, userId: req.user.id }, transaction: t });
    if (!mine) throw new AppError(403, 'NOT_YOUR_WAREHOUSE', 'You are not in charge of this warehouse');
  }
  if (active && !w.isActive) throw new AppError(409, 'WAREHOUSE_INACTIVE', `${w.name} is inactive`);
  return w;
}

// Any active warehouse (e.g. the destination of a transfer, a salesperson's warehouse). No per-user restriction.
async function activeOne(id, t, field = 'warehouseId') {
  const w = await Warehouse.findByPk(id, { transaction: t });
  if (!w || !w.isActive) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message: 'Warehouse not found or inactive' }]);
  return w;
}

module.exports = { seesAll, scope, access, activeOne };
