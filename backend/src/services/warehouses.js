const { Warehouse, WarehouseStorekeeper, Salesperson } = require('../models');
const { AppError } = require('../utils/errors');

/* Who may use which warehouse.
   - `warehouses.read_all` (Manager, Owner): every warehouse.
   - everybody else: only the warehouses they are assigned to as storekeeper (warehouse_storekeepers).
   The API enforces this on every route; the frontend only hides things for convenience. */
const seesAll = (req) => req.user.permissions.has('warehouses.read_all');

// null = no restriction, otherwise the list of warehouse ids this user is in charge of.
// Everybody else: the warehouses they look after as storekeeper plus the warehouse they sell from as salesperson.
const scope = async (req, t) => {
  if (seesAll(req)) return null;
  const keep = await WarehouseStorekeeper.findAll({ where: { userId: req.user.id }, attributes: ['warehouseId'], transaction: t });
  const sell = await Salesperson.findAll({ where: { userId: req.user.id, isActive: true }, attributes: ['warehouseId'], transaction: t });
  return [...new Set([...keep, ...sell].map((r) => r.warehouseId).filter(Boolean))];
};

// Who sees the WHOLE item catalogue and who only the items held in their own warehouse(s).
//   null  = the whole catalogue (Manager / Owner, and anybody who can create items or receive stock - they must be able to find items
//           that are not in the warehouse yet).
//   array = warehouse ids: the user (e.g. a salesperson) sees only items that have stock rows in those warehouses; [] = no warehouse assigned.
const itemScope = async (req) => {
  const p = req.user.permissions;
  if (['warehouses.read_all', 'items.create', 'receiving.create'].some((x) => p.has(x))) return null;
  return (await scope(req)) || [];
};

// Loads a warehouse the user may use. { active: true } also requires it to be active (receiving into it, transferring out of it, ...).
async function access(req, id, t, { active = false } = {}) {
  const w = await Warehouse.findByPk(id, { transaction: t });
  if (!w) throw new AppError(404, 'NOT_FOUND', 'Warehouse not found');
  const mine = await scope(req, t);
  if (mine && !mine.includes(id)) throw new AppError(403, 'NOT_YOUR_WAREHOUSE', 'You are not in charge of this warehouse');
  if (active && !w.isActive) throw new AppError(409, 'WAREHOUSE_INACTIVE', `${w.name} is inactive`);
  return w;
}

// Any active warehouse (e.g. the destination of a transfer, a salesperson's warehouse). No per-user restriction.
async function activeOne(id, t, field = 'warehouseId') {
  const w = await Warehouse.findByPk(id, { transaction: t });
  if (!w || !w.isActive) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message: 'Warehouse not found or inactive' }]);
  return w;
}

module.exports = { seesAll, scope, itemScope, access, activeOne };
