const { Op, literal, QueryTypes } = require('sequelize');
const { sequelize, Warehouse, WarehouseStorekeeper, User, Role, Salesperson, WarehouseStock, Item, Category } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');
const wh = require('../services/warehouses');

const can = (req, p) => req.user.permissions.has(p);
const bad = (field, message) => new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message }]);
const totals = [
  [literal('(SELECT CAST(COUNT(*) AS int) FROM warehouse_stock s WHERE s.warehouse_id = "Warehouse"."id" AND s.quantity > 0)'), 'itemCount'],
  [literal('(SELECT COALESCE(SUM(s.quantity), 0) FROM warehouse_stock s WHERE s.warehouse_id = "Warehouse"."id")'), 'totalUnits'],
];
const audited = (w, keepers) => ({ code: w.code, name: w.name, location: w.location, description: w.description, isDefault: w.isDefault, isActive: w.isActive,
  ...(keepers && { storekeepers: keepers }) });

// storekeepers (id + name) of the given warehouses, as { warehouseId: [...] }
const keepersOf = async (ids, t) => {
  const out = {}; if (!ids.length) return out;
  const rows = await sequelize.query(`SELECT k.warehouse_id AS "warehouseId", u.id, u.full_name AS "fullName", u.username FROM warehouse_storekeepers k JOIN users u ON u.id = k.user_id
    WHERE k.warehouse_id IN (:ids) ORDER BY u.full_name`, { replacements: { ids }, type: QueryTypes.SELECT, transaction: t });
  rows.forEach((r) => { (out[r.warehouseId] ||= []).push({ id: r.id, fullName: r.fullName, username: r.username }); });
  return out;
};
// Every id must be an ACTIVE user whose role is Storekeeper.
const checkKeepers = async (ids, t) => {
  if (!ids.length) return;
  const ok = await User.findAll({ where: { id: ids, status: 'ACTIVE' }, include: [{ model: Role, as: 'role', where: { code: 'STOREKEEPER' }, attributes: [] }], attributes: ['id'], transaction: t });
  if (ok.length !== new Set(ids).size) throw bad('storekeeperIds', 'Choose active users with the Storekeeper role');
};
const setKeepers = async (req, w, ids, t) => {
  await WarehouseStorekeeper.destroy({ where: { warehouseId: w.id }, transaction: t });
  if (ids.length) await WarehouseStorekeeper.bulkCreate([...new Set(ids)].map((userId) => ({ warehouseId: w.id, userId, assignedBy: req.user.id })), { transaction: t });
};
const show = async (req, id) => {
  const w = await Warehouse.findByPk(id, { attributes: { include: totals } });
  const o = w.toJSON(); o.storekeepers = (await keepersOf([id]))[id] || [];
  o.salespersons = await Salesperson.findAll({ where: { warehouseId: id }, attributes: ['id', 'code', 'fullName', 'isActive'], order: [['fullName', 'ASC']] });
  return o;
};

exports.list = async (req, res) => {
  const { search, isActive, page, limit } = req.query; const where = {};
  const mine = await wh.scope(req); if (mine) where.id = mine;
  if (isActive !== undefined) where.isActive = isActive;
  if (search) where[Op.or] = ['name', 'code', 'location'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const { rows, count } = await Warehouse.findAndCountAll({ where, attributes: { include: totals }, order: [['isDefault', 'DESC'], ['name', 'ASC']], limit, offset: (page - 1) * limit });
  const keepers = await keepersOf(rows.map((r) => r.id));
  res.json({ data: rows.map((r) => ({ ...r.toJSON(), storekeepers: keepers[r.id] || [] })), total: count, page, limit });
};

// Warehouses the user can pick in forms (receiving, transfers, salesperson). Needs a login only; the result is already limited to what the user may use.
exports.options = async (req, res) => {
  const mine = req.query.all === 'true' ? null : await wh.scope(req);   // ?all=true: every active warehouse (names only), e.g. the destination of a transfer
  const rows = await Warehouse.findAll({ where: { isActive: true, ...(mine && { id: mine }) }, attributes: ['id', 'code', 'name', 'isDefault',
      [literal(`(SELECT STRING_AGG(s.full_name, ', ') FROM salespersons s WHERE s.warehouse_id = "Warehouse"."id" AND s.is_active)`), 'salespersonNames']],
    order: [['isDefault', 'DESC'], ['name', 'ASC']] });
  res.json(rows);
};

// Active users with the Storekeeper role, for the "storekeepers in charge" picker.
exports.storekeepers = async (req, res) => {
  const rows = await User.findAll({ where: { status: 'ACTIVE' }, attributes: ['id', 'fullName', 'username'], order: [['fullName', 'ASC']],
    include: [{ model: Role, as: 'role', where: { code: 'STOREKEEPER' }, attributes: [] }] });
  res.json(rows);
};

exports.getOne = async (req, res) => { await wh.access(req, req.params.id); res.json(await show(req, req.params.id)); };

exports.create = async (req, res) => {
  const b = req.body; const ids = b.storekeeperIds || [];
  if (ids.length && !can(req, 'warehouses.assign')) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to assign storekeepers');
  const id = await sequelize.transaction(async (t) => {
    await checkKeepers(ids, t);
    const [r] = await sequelize.query("SELECT nextval('warehouse_code_seq') AS n", { transaction: t });
    const first = (await Warehouse.count({ transaction: t })) === 0;                       // the very first warehouse becomes the default one
    const w = await Warehouse.create({ code: `WH-${String(r[0].n).padStart(6, '0')}`, name: b.name, location: b.location ?? null, description: b.description ?? null,
      isDefault: first, createdBy: req.user.id }, { transaction: t });
    await setKeepers(req, w, ids, t);
    await audit.log(req, { action: 'WAREHOUSE_CREATED', entityType: 'Warehouse', entityId: w.id, newValues: audited(w, ids) }, t);
    return w.id;
  });
  res.status(201).json(await show(req, id));
};

exports.update = async (req, res) => {
  const b = req.body;
  if (b.storekeeperIds !== undefined && !can(req, 'warehouses.assign')) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to assign storekeepers');
  await sequelize.transaction(async (t) => {
    const w = await Warehouse.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!w) throw new AppError(404, 'NOT_FOUND', 'Warehouse not found');
    const old = audited(w, ((await keepersOf([w.id], t))[w.id] || []).map((k) => k.id));
    const { storekeeperIds, isDefault, ...head } = b;
    if (isDefault) {
      if (!w.isActive) throw new AppError(409, 'WAREHOUSE_INACTIVE', 'An inactive warehouse cannot be the default');
      await Warehouse.update({ isDefault: false }, { where: { isDefault: true }, transaction: t });
      head.isDefault = true;
    }
    await w.update(head, { transaction: t });
    if (storekeeperIds !== undefined) { await checkKeepers(storekeeperIds, t); await setKeepers(req, w, storekeeperIds, t); }
    await audit.log(req, { action: 'WAREHOUSE_UPDATED', entityType: 'Warehouse', entityId: w.id, oldValues: old,
      newValues: audited(w, storekeeperIds ?? old.storekeepers) }, t);
  });
  res.json(await show(req, req.params.id));
};

exports.setStatus = async (req, res) => {
  const { isActive, reason } = req.body;
  await sequelize.transaction(async (t) => {
    const w = await Warehouse.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!w) throw new AppError(404, 'NOT_FOUND', 'Warehouse not found');
    if (!isActive) {
      if (w.isDefault) throw new AppError(409, 'IS_DEFAULT', 'Make another warehouse the default before deactivating this one');
      const [{ units }] = await sequelize.query('SELECT COALESCE(SUM(quantity), 0) AS units FROM warehouse_stock WHERE warehouse_id = :id', { replacements: { id: w.id }, type: QueryTypes.SELECT, transaction: t });
      if (Number(units) > 0) throw new AppError(409, 'NOT_EMPTY', `This warehouse still holds ${units} units. Transfer the stock out first.`);
      const [{ n }] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM warehouse_transfers WHERE status IN ('SUBMITTED', 'IN_TRANSIT') AND (from_warehouse_id = :id OR to_warehouse_id = :id)`, { replacements: { id: w.id }, type: QueryTypes.SELECT, transaction: t });
      if (n) throw new AppError(409, 'PENDING_TRANSFERS', 'There are transfers waiting for approval for this warehouse');
      const sp = await Salesperson.count({ where: { warehouseId: w.id, isActive: true }, transaction: t });
      if (sp) throw new AppError(409, 'HAS_SALESPERSONS', 'Salespersons are still assigned to this warehouse. Move them to another warehouse first.');
    }
    const old = audited(w); await w.update({ isActive }, { transaction: t });
    await audit.log(req, { action: isActive ? 'WAREHOUSE_ACTIVATED' : 'WAREHOUSE_DEACTIVATED', entityType: 'Warehouse', entityId: w.id, oldValues: old, newValues: audited(w), reason }, t);
  });
  res.json(await show(req, req.params.id));
};

// What is in this warehouse now (batches are listed for items that track expiry). Cost price is never exposed here.
exports.stock = async (req, res) => {
  await wh.access(req, req.params.id);
  const { search, page, limit } = req.query; const w = req.params.id;
  const itemWhere = {}; if (search) itemWhere[Op.or] = ['name', 'sku', 'barcode'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const { rows, count } = await WarehouseStock.findAndCountAll({ where: { warehouseId: w, quantity: { [Op.gt]: 0 } },
    include: [{ model: Item, as: 'item', required: true, where: itemWhere, attributes: ['id', 'sku', 'name', 'unit', 'trackExpiry', 'reorderLevel'],
      include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }] }],
    order: [[{ model: Item, as: 'item' }, 'name', 'ASC']], limit, offset: (page - 1) * limit });
  const tracked = rows.filter((r) => r.item.trackExpiry).map((r) => r.itemId);
  const batches = tracked.length ? await sequelize.query(`SELECT b.item_id AS "itemId", b.id, b.batch_no AS "batchNo", b.expiry_date AS "expiryDate", wsb.quantity
    FROM warehouse_stock_batches wsb JOIN stock_batches b ON b.id = wsb.batch_id WHERE wsb.warehouse_id = :w AND wsb.quantity > 0 AND b.item_id IN (:ids) ORDER BY b.expiry_date`,
  { replacements: { w, ids: tracked }, type: QueryTypes.SELECT }) : [];
  res.json({ data: rows.map((r) => ({ ...r.toJSON(), batches: batches.filter((b) => b.itemId === r.itemId) })), total: count, page, limit });
};

// The warehouse's own ledger: receiving, sales, transfers in / out ...
exports.movements = async (req, res) => {
  await wh.access(req, req.params.id);
  const { itemId, type, from, to, page, limit } = req.query;
  const where = ['m.warehouse_id = :w']; const rep = { w: req.params.id, limit, offset: (page - 1) * limit };
  if (itemId) { where.push('m.item_id = :itemId'); rep.itemId = itemId; }
  if (type) { where.push('m.movement_type = :type'); rep.type = type; }
  if (from) { where.push('m.occurred_at >= CAST(:from AS date)'); rep.from = from; }
  if (to) { where.push("m.occurred_at < CAST(:to AS date) + INTERVAL '1 day'"); rep.to = to; }
  const W = where.join(' AND ');
  const [{ n }] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM warehouse_movements m WHERE ${W}`, { replacements: rep, type: QueryTypes.SELECT });
  const data = await sequelize.query(`SELECT m.id, m.occurred_at AS "occurredAt", m.movement_type AS "movementType", m.direction, m.quantity, m.balance_after AS "balanceAfter",
      m.note, m.ref_type AS "refType", m.ref_id AS "refId", i.id AS "itemId", i.sku, i.name AS "itemName", i.unit, b.batch_no AS "batchNo", u.full_name AS "performedBy"
    FROM warehouse_movements m JOIN items i ON i.id = m.item_id LEFT JOIN stock_batches b ON b.id = m.batch_id LEFT JOIN users u ON u.id = m.performed_by
    WHERE ${W} ORDER BY m.id DESC LIMIT :limit OFFSET :offset`, { replacements: rep, type: QueryTypes.SELECT });
  res.json({ data, total: n, page, limit });
};
