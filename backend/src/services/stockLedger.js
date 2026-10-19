const { sequelize, Item, StockBatch, StockMovement } = require('../models');
const { AppError } = require('../utils/errors');

/* The ONLY place where stock quantities change. It runs inside the approval transaction, so a failure
   anywhere (e.g. not enough stock on line 3) rolls back the whole document AND its approval.
   Quantities are changed with atomic SQL (`quantity = quantity +/- x`), and OUT movements are guarded
   (`AND quantity >= x`), so stock can never go negative even with concurrent requests. */
const run = async (t, sql, replacements) => (await sequelize.query(sql, { transaction: t, replacements }))[0];
const fail = (status, code, message, field) => new AppError(status, code, message, field ? [{ field, message }] : undefined);


/* ---------- warehouses ----------
   stock_levels / stock_batches are the company-wide totals; warehouse_stock / warehouse_stock_batches split them per warehouse.
   Every posted line moves BOTH, in the same transaction, so SUM(warehouse_stock) always equals stock_levels. */

// The warehouse a document works in: the one it names, otherwise the default warehouse.
async function resolveWarehouse(t, warehouseId) {
  const rows = warehouseId
    ? await run(t, 'SELECT id FROM warehouses WHERE id = :id', { id: warehouseId })
    : await run(t, 'SELECT id FROM warehouses WHERE is_default LIMIT 1');
  if (!rows.length) throw fail(409, 'NO_WAREHOUSE', warehouseId ? 'Warehouse not found' : 'No default warehouse is set up. Create a warehouse first.');
  return rows[0].id;
}

// Non-expired batches of an item that are physically in a warehouse, first-expiry-first-out (rows are locked). Used by sales allocation.
async function batchesIn(t, warehouseId, itemId, today) {
  return run(t, `SELECT b.id, b.batch_no AS "batchNo", b.expiry_date AS "expiryDate", wsb.quantity
      FROM warehouse_stock_batches wsb JOIN stock_batches b ON b.id = wsb.batch_id
     WHERE wsb.warehouse_id = :w AND b.item_id = :i AND wsb.quantity > 0 AND b.expiry_date >= :today
     ORDER BY b.expiry_date ASC, b.batch_no ASC FOR UPDATE OF wsb`, { w: warehouseId, i: itemId, today });
}

// Changes the stock of ONE warehouse (never below zero) and writes the warehouse ledger row. Also used by warehouse transfers.
async function warehouseMove(t, p) {
  const { warehouseId: w, itemId: i, batchId, direction, quantity: q, label, movementType, refType, refId, userId, note } = p;
  const b = batchId || null;
  await run(t, 'INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, updated_at) VALUES (:w, :i, 0, NOW()) ON CONFLICT (warehouse_id, item_id) DO NOTHING', { w, i });
  let after;
  if (direction === 'IN') {
    if (b) await run(t, `INSERT INTO warehouse_stock_batches (warehouse_id, batch_id, quantity, updated_at) VALUES (:w, :b, CAST(:q AS numeric), NOW())
      ON CONFLICT (warehouse_id, batch_id) DO UPDATE SET quantity = warehouse_stock_batches.quantity + CAST(:q AS numeric), updated_at = NOW()`, { w, b, q });
    [{ quantity: after }] = await run(t, 'UPDATE warehouse_stock SET quantity = quantity + CAST(:q AS numeric), updated_at = NOW() WHERE warehouse_id = :w AND item_id = :i RETURNING quantity', { w, i, q });
  } else {
    if (b) {
      const okB = await run(t, `UPDATE warehouse_stock_batches SET quantity = quantity - CAST(:q AS numeric), updated_at = NOW()
        WHERE warehouse_id = :w AND batch_id = :b AND quantity >= CAST(:q AS numeric) RETURNING quantity`, { w, b, q });
      if (!okB.length) throw fail(409, 'INSUFFICIENT_STOCK', `Not enough of this batch of ${label} in the warehouse`, 'quantity');
    }
    const ok = await run(t, 'UPDATE warehouse_stock SET quantity = quantity - CAST(:q AS numeric), updated_at = NOW() WHERE warehouse_id = :w AND item_id = :i AND quantity >= CAST(:q AS numeric) RETURNING quantity', { w, i, q });
    if (!ok.length) {
      const [cur] = await run(t, 'SELECT quantity FROM warehouse_stock WHERE warehouse_id = :w AND item_id = :i', { w, i });
      throw fail(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${label} in this warehouse: ${cur ? cur.quantity : 0} available, ${q} requested`, 'quantity');
    }
    after = ok[0].quantity;
  }
  await run(t, `INSERT INTO warehouse_movements (warehouse_id, item_id, batch_id, movement_type, direction, quantity, balance_after, ref_type, ref_id, performed_by, note)
    VALUES (:w, :i, :b, :mt, :dir, CAST(:q AS numeric), :after, :rt, :rid, :uid, :note)`,
  { w, i, b, mt: movementType, dir: direction, q, after, rt: refType || null, rid: refId || null, uid: userId, note: note || null });
  return after;
}

async function postLine(t, doc, line, userId, today, warehouseId) {
  const item = await Item.findByPk(line.itemId, { transaction: t, lock: t.LOCK.UPDATE }); // serialises work per item
  if (!item) throw fail(404, 'NOT_FOUND', 'An item on this document no longer exists');
  const label = `${item.sku} - ${item.name}`;
  const q = line.quantity;
  await run(t, 'INSERT INTO stock_levels (item_id, quantity, updated_at) VALUES (:id, 0, NOW()) ON CONFLICT (item_id) DO NOTHING', { id: item.id });

  let batchId = null; let after; let unitCost;
  if (line.direction === 'IN') {
    if (!item.isActive) throw fail(409, 'ITEM_INACTIVE', `${label} is inactive and cannot receive stock`);
    unitCost = line.unitCost;
    const [prev] = await run(t, 'SELECT quantity FROM stock_levels WHERE item_id = :id', { id: item.id });
    if (item.trackExpiry) {
      if (!line.batchNo || !line.expiryDate) throw fail(422, 'BATCH_REQUIRED', `Batch number and expiry date are required for ${label}`);
      const [batch] = await StockBatch.findOrCreate({ where: { itemId: item.id, batchNo: line.batchNo },
        defaults: { expiryDate: line.expiryDate, quantity: 0 }, transaction: t });
      if (batch.expiryDate !== line.expiryDate)
        throw fail(409, 'BATCH_EXPIRY_MISMATCH', `Batch ${line.batchNo} of ${label} already exists with expiry ${batch.expiryDate}`);
      await run(t, 'UPDATE stock_batches SET quantity = quantity + CAST(:q AS numeric), updated_at = NOW() WHERE id = :bid', { q, bid: batch.id });
      batchId = batch.id;
    }
    if (doc.type === 'RECEIVING' && line.unitCost != null) // weighted-average cost
      await run(t, `UPDATE items SET updated_at = NOW(), cost_price = ROUND((CAST(:prev AS numeric) * cost_price + CAST(:q AS numeric) * CAST(:uc AS numeric))
        / (CAST(:prev AS numeric) + CAST(:q AS numeric)), 2) WHERE id = :id`, { prev: prev.quantity, q, uc: line.unitCost, id: item.id });
    [{ quantity: after }] = await run(t, 'UPDATE stock_levels SET quantity = quantity + CAST(:q AS numeric), updated_at = NOW() WHERE item_id = :id RETURNING quantity', { q, id: item.id });
  } else {
    unitCost = item.costPrice;
    if (doc.type === 'EXPIRED' && !item.trackExpiry) throw fail(422, 'NOT_TRACKED', `${label} does not track expiry dates`);
    if (item.trackExpiry) {
      const batch = await StockBatch.findOne({ where: { id: line.batchId, itemId: item.id }, transaction: t, lock: t.LOCK.UPDATE });
      if (!batch) throw fail(422, 'BATCH_REQUIRED', `Choose a batch for ${label}`);
      if (doc.type === 'EXPIRED' && batch.expiryDate > today)
        throw fail(409, 'NOT_EXPIRED', `Batch ${batch.batchNo} of ${label} expires on ${batch.expiryDate} - it is not expired yet`);
      const ok = await run(t, 'UPDATE stock_batches SET quantity = quantity - CAST(:q AS numeric), updated_at = NOW() WHERE id = :bid AND quantity >= CAST(:q AS numeric) RETURNING quantity', { q, bid: batch.id });
      if (!ok.length) throw fail(409, 'INSUFFICIENT_STOCK', `Batch ${batch.batchNo} of ${label} has only ${batch.quantity} left, ${q} requested`, 'quantity');
      batchId = batch.id;
    }
    const ok = await run(t, 'UPDATE stock_levels SET quantity = quantity - CAST(:q AS numeric), updated_at = NOW() WHERE item_id = :id AND quantity >= CAST(:q AS numeric) RETURNING quantity', { q, id: item.id });
    if (!ok.length) {
      const [cur] = await run(t, 'SELECT quantity FROM stock_levels WHERE item_id = :id', { id: item.id });
      throw fail(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${label}: ${cur.quantity} available, ${q} requested`, 'quantity');
    }
    after = ok[0].quantity;
  }

  await warehouseMove(t, { warehouseId, itemId: item.id, batchId, direction: line.direction, quantity: q, label, movementType: doc.type,
    refType: 'StockDocument', refId: doc.id, userId, note: (line.remarks || doc.reason || '').slice(0, 255) || null });

  await StockMovement.create({
    itemId: item.id, batchId, documentId: doc.id, lineId: line.id, movementType: doc.type, direction: line.direction,
    quantity: q, balanceAfter: after, unitCost: unitCost ?? null, performedBy: userId, occurredAt: new Date(),
    note: (line.remarks || doc.reason || '').slice(0, 255) || null,
  }, { transaction: t });
}

// Lines must arrive sorted by itemId so concurrent documents lock items in the same order (no deadlocks).
async function post(t, doc, lines, userId) {
  const [{ d: today }] = await run(t, "SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d");
  const warehouseId = await resolveWarehouse(t, doc.warehouseId);
  for (const line of lines) await postLine(t, doc, line, userId, today, warehouseId);
}
module.exports = { post, resolveWarehouse, batchesIn, warehouseMove };
