const { QueryTypes } = require('sequelize');
const { sequelize, PhysicalCount, PhysicalCountLine } = require('../models');
const audit = require('./audit');
const wh = require('./warehouses');
const { AppError } = require('../utils/errors');
const { todayLocal } = require('./warehouseStatement');

/* Physical Count (stock-take). Recording a count NEVER changes stock: it only says what was counted, on which day, in which warehouse.
   The Warehouse Inventory Statement picks up the latest count of every item inside its period (Physical Count + Inventory Variance columns).
   A wrong count is voided (reason required) and entered again. If the business wants the books corrected, it posts a normal Stock Adjustment. */
const TZ = process.env.REPORT_TZ || 'Africa/Dar_es_Salaam';
const bad = (field, message) => new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message }]);
const r3 = (v) => Math.round(Number(v || 0) * 1000) / 1000;

/* Every product of one warehouse (same rule as the statement: a stock row or any movement there) with the book quantity at the END of `date`.
   book at end of day D = quantity now - net movement from the start of D+1 onwards. */
async function sheet(warehouseId, date, t) {
  return sequelize.query(`
    SELECT i.id AS "itemId", i.sku, i.name, i.unit, c.name AS category,
      COALESCE(z.quantity, 0) - COALESCE(n.net, 0) AS "bookQty"
    FROM items i
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN warehouse_stock z ON z.item_id = i.id AND z.warehouse_id = :w
    LEFT JOIN (SELECT item_id, SUM(CASE direction WHEN 'IN' THEN quantity ELSE -quantity END) AS net
               FROM warehouse_movements
               WHERE warehouse_id = :w AND occurred_at >= (CAST(:d AS date) + 1)::timestamp AT TIME ZONE :tz
               GROUP BY item_id) n ON n.item_id = i.id
    WHERE (z.item_id IS NOT NULL OR EXISTS (SELECT 1 FROM warehouse_movements y WHERE y.warehouse_id = :w AND y.item_id = i.id))
      AND (i.is_active OR COALESCE(z.quantity, 0) <> 0)
    ORDER BY c.name NULLS LAST, i.name, i.sku`,
  { replacements: { w: warehouseId, d: date, tz: TZ }, type: QueryTypes.SELECT, transaction: t });
}

const snap = (c) => ({ countNo: c.countNo, warehouseId: c.warehouseId, countDate: c.countDate, status: c.status, note: c.note });

const create = (req, body) => sequelize.transaction(async (t) => {
  const w = await wh.access(req, body.warehouseId, t, { active: true });   // only a warehouse you are in charge of
  if (body.countDate > todayLocal()) throw bad('countDate', 'The count date cannot be in the future');
  const book = new Map((await sheet(w.id, body.countDate, t)).map((r) => [r.itemId, r]));
  const seen = new Set();
  const lines = body.lines.map((l, n) => {
    const f = (k) => `lines.${n}.${k}`;
    const row = book.get(l.itemId);
    if (!row) throw bad(f('itemId'), 'This product is not in this warehouse');
    if (seen.has(l.itemId)) throw bad(f('itemId'), 'This product is already on another line');
    seen.add(l.itemId);
    return { itemId: l.itemId, countedQty: l.countedQty, bookQty: r3(row.bookQty), remarks: l.remarks || null };
  });
  const [seq] = await sequelize.query("SELECT nextval('physical_count_seq') AS n", { transaction: t });
  const countNo = `PC-${new Date().getFullYear()}-${String(seq[0].n).padStart(6, '0')}`;
  const c = await PhysicalCount.create({ countNo, warehouseId: w.id, countDate: body.countDate, status: 'POSTED', note: body.note || null, createdBy: req.user.id }, { transaction: t });
  await PhysicalCountLine.bulkCreate(lines.map((l) => ({ ...l, countId: c.id })), { transaction: t });
  await audit.log(req, { action: 'PHYSICAL_COUNT_RECORDED', entityType: 'PhysicalCount', entityId: c.id, newValues: { ...snap(c), lines: lines.length } }, t);
  return c;
});

// A count that was entered wrongly. The reason is kept; the statement stops using it at once.
const voidCount = (req, id, reason) => sequelize.transaction(async (t) => {
  const c = await PhysicalCount.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Physical count not found');
  await wh.access(req, c.warehouseId, t);
  if (c.status === 'VOID') throw new AppError(409, 'BAD_STATE', 'This count is already void');
  const old = snap(c);
  await c.update({ status: 'VOID', voidedBy: req.user.id, voidedAt: new Date(), voidReason: reason }, { transaction: t });
  await audit.log(req, { action: 'PHYSICAL_COUNT_VOIDED', entityType: 'PhysicalCount', entityId: c.id, oldValues: old, newValues: snap(c), reason }, t);
  return c;
});

module.exports = { sheet, create, voidCount };
