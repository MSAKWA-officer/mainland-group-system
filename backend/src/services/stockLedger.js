const { sequelize, Item, StockBatch, StockMovement } = require('../models');
const { AppError } = require('../utils/errors');

/* The ONLY place where stock quantities change. It runs inside the approval transaction, so a failure
   anywhere (e.g. not enough stock on line 3) rolls back the whole document AND its approval.
   Quantities are changed with atomic SQL (`quantity = quantity +/- x`), and OUT movements are guarded
   (`AND quantity >= x`), so stock can never go negative even with concurrent requests. */
const run = async (t, sql, replacements) => (await sequelize.query(sql, { transaction: t, replacements }))[0];
const fail = (status, code, message, field) => new AppError(status, code, message, field ? [{ field, message }] : undefined);

async function postLine(t, doc, line, userId, today) {
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

  await StockMovement.create({
    itemId: item.id, batchId, documentId: doc.id, lineId: line.id, movementType: doc.type, direction: line.direction,
    quantity: q, balanceAfter: after, unitCost: unitCost ?? null, performedBy: userId, occurredAt: new Date(),
    note: (line.remarks || doc.reason || '').slice(0, 255) || null,
  }, { transaction: t });
}

// Lines must arrive sorted by itemId so concurrent documents lock items in the same order (no deadlocks).
async function post(t, doc, lines, userId) {
  const [{ d: today }] = await run(t, "SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d");
  for (const line of lines) await postLine(t, doc, line, userId, today);
}
module.exports = { post };
