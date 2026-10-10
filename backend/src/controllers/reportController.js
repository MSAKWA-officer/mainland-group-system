const { sequelize } = require('../models');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');

/* Read-only stock reports (raw SQL, all values bound as parameters).
   Anything that exposes cost or stock value is only returned to users holding `stock_reports.valuation`. */
const rows = async (sql, replacements) => (await sequelize.query(sql, { replacements }))[0];
const canValue = (req) => req.user.permissions.has('stock_reports.valuation');
const paged = (list, page, limit) => ({ data: list.map(({ total, ...r }) => r), total: list.length ? Number(list[0].total) : 0, page, limit });
// Date window for movement-based reports: defaults to the last 30 days; `to` is inclusive.
const RANGE = 'm.occurred_at >= COALESCE(CAST(:from AS date), CURRENT_DATE - 30) AND m.occurred_at < COALESCE(CAST(:to AS date), CURRENT_DATE) + 1';

exports.summary = async (req, res) => {
  const v = canValue(req);
  const [r] = await rows(`SELECT
    (SELECT CAST(COUNT(*) AS int) FROM items WHERE is_active) AS "activeItems",
    (SELECT COALESCE(SUM(quantity), 0) FROM stock_levels) AS "totalUnits",
    (SELECT CAST(COUNT(*) AS int) FROM stock_levels s JOIN items i ON i.id = s.item_id WHERE i.is_active AND s.quantity = 0) AS "outOfStock",
    (SELECT CAST(COUNT(*) AS int) FROM stock_levels s JOIN items i ON i.id = s.item_id WHERE i.is_active AND i.reorder_level > 0 AND s.quantity <= i.reorder_level) AS "lowStock",
    (SELECT CAST(COUNT(*) AS int) FROM stock_batches WHERE quantity > 0 AND expiry_date < CURRENT_DATE) AS "expiredBatches",
    (SELECT CAST(COUNT(*) AS int) FROM stock_batches WHERE quantity > 0 AND expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + CAST(:days AS integer)) AS "expiringSoon",
    (SELECT CAST(COUNT(*) AS int) FROM stock_documents WHERE status = 'SUBMITTED') AS "pendingApprovals"
    ${v ? ', (SELECT COALESCE(ROUND(SUM(s.quantity * i.cost_price), 2), 0) FROM stock_levels s JOIN items i ON i.id = s.item_id) AS "stockValue"' : ''}`,
  { days: req.query.days });
  res.json({ ...r, expiringWithinDays: req.query.days });
};

exports.stockOnHand = async (req, res) => {
  const { search, categoryId, includeZero, page, limit } = req.query; const v = canValue(req);
  const list = await rows(`SELECT i.id AS "itemId", i.sku, i.name, i.unit, c.name AS category, s.quantity,
      i.reorder_level AS "reorderLevel", i.selling_price AS "sellingPrice"
      ${v ? ', i.cost_price AS "costPrice", ROUND(s.quantity * i.cost_price, 2) AS "stockValue"' : ''}, COUNT(*) OVER() AS total
    FROM stock_levels s JOIN items i ON i.id = s.item_id JOIN categories c ON c.id = i.category_id
    WHERE i.is_active AND (CAST(:categoryId AS uuid) IS NULL OR i.category_id = CAST(:categoryId AS uuid))
      AND (CAST(:search AS text) IS NULL OR i.name ILIKE :like OR i.sku ILIKE :like) AND (:includeZero OR s.quantity > 0)
    ORDER BY c.name, i.name LIMIT :limit OFFSET :offset`,
  { categoryId: categoryId || null, search: search || null, like: search ? like(search) : null, includeZero: !!includeZero, limit, offset: (page - 1) * limit });
  res.json(paged(list, page, limit));
};

exports.lowStock = async (req, res) => {
  const { page, limit } = req.query;
  const list = await rows(`SELECT i.id AS "itemId", i.sku, i.name, i.unit, c.name AS category, s.quantity,
      i.reorder_level AS "reorderLevel", i.reorder_level - s.quantity AS shortfall, COUNT(*) OVER() AS total
    FROM stock_levels s JOIN items i ON i.id = s.item_id JOIN categories c ON c.id = i.category_id
    WHERE i.is_active AND i.reorder_level > 0 AND s.quantity <= i.reorder_level
    ORDER BY s.quantity / i.reorder_level ASC, i.name LIMIT :limit OFFSET :offset`, { limit, offset: (page - 1) * limit });
  res.json(paged(list, page, limit));
};

exports.expiry = async (req, res) => {
  const { days, includeExpired, page, limit } = req.query; const v = canValue(req);
  const list = await rows(`SELECT b.id AS "batchId", i.id AS "itemId", i.sku, i.name, i.unit, b.batch_no AS "batchNo",
      to_char(b.expiry_date, 'YYYY-MM-DD') AS "expiryDate", b.quantity, b.expiry_date - CURRENT_DATE AS "daysLeft",
      CASE WHEN b.expiry_date < CURRENT_DATE THEN 'EXPIRED' ELSE 'EXPIRING' END AS status
      ${v ? ', ROUND(b.quantity * i.cost_price, 2) AS "stockValue"' : ''}, COUNT(*) OVER() AS total
    FROM stock_batches b JOIN items i ON i.id = b.item_id
    WHERE b.quantity > 0 AND b.expiry_date <= CURRENT_DATE + CAST(:days AS integer) AND (:includeExpired OR b.expiry_date >= CURRENT_DATE)
    ORDER BY b.expiry_date, i.name LIMIT :limit OFFSET :offset`,
  { days, includeExpired, limit, offset: (page - 1) * limit });
  res.json(paged(list, page, limit));
};

exports.movements = async (req, res) => {
  const { from, to, groupBy, page, limit } = req.query; const v = canValue(req);
  const base = { from: from || null, to: to || null };
  if (groupBy === 'item') {
    const list = await rows(`SELECT i.id AS "itemId", i.sku, i.name, i.unit,
        COALESCE(SUM(m.quantity) FILTER (WHERE m.direction = 'IN'), 0) AS "qtyIn",
        COALESCE(SUM(m.quantity) FILTER (WHERE m.direction = 'OUT'), 0) AS "qtyOut", s.quantity AS balance, COUNT(*) OVER() AS total
      FROM stock_movements m JOIN items i ON i.id = m.item_id JOIN stock_levels s ON s.item_id = i.id
      WHERE ${RANGE} GROUP BY i.id, s.quantity ORDER BY i.name LIMIT :limit OFFSET :offset`, { ...base, limit, offset: (page - 1) * limit });
    return res.json(paged(list, page, limit));
  }
  const data = await rows(`SELECT m.movement_type AS "movementType", m.direction, CAST(COUNT(*) AS int) AS movements, SUM(m.quantity) AS quantity
      ${v ? ', ROUND(SUM(m.quantity * COALESCE(m.unit_cost, 0)), 2) AS value' : ''}
    FROM stock_movements m WHERE ${RANGE} GROUP BY 1, 2 ORDER BY 1, 2`, base);
  res.json({ data });
};

// Stock lost to expiry, damage, supplier returns and negative adjustments.
exports.writeOffs = async (req, res) => {
  const { from, to } = req.query; const v = canValue(req); const p = { from: from || null, to: to || null };
  const LOSS = `(m.movement_type IN ('EXPIRED', 'DAMAGED', 'REJECT_OUT') OR (m.movement_type = 'ADJUSTMENT' AND m.direction = 'OUT')) AND ${RANGE}`;
  const byType = await rows(`SELECT m.movement_type AS "movementType", CAST(COUNT(*) AS int) AS movements, SUM(m.quantity) AS quantity
      ${v ? ', ROUND(SUM(m.quantity * COALESCE(m.unit_cost, 0)), 2) AS value' : ''}
    FROM stock_movements m WHERE ${LOSS} GROUP BY 1 ORDER BY 1`, p);
  const topItems = await rows(`SELECT i.id AS "itemId", i.sku, i.name, i.unit, SUM(m.quantity) AS quantity
      ${v ? ', ROUND(SUM(m.quantity * COALESCE(m.unit_cost, 0)), 2) AS value' : ''}
    FROM stock_movements m JOIN items i ON i.id = m.item_id WHERE ${LOSS} GROUP BY i.id ORDER BY SUM(m.quantity) DESC LIMIT 20`, p);
  res.json({ byType, topItems });
};

// Stock value by category (cost-based). Needs `stock_reports.valuation`; every view is audited.
exports.valuation = async (req, res) => {
  const data = await rows(`SELECT c.id AS "categoryId", c.name AS category, CAST(COUNT(*) AS int) AS items, SUM(s.quantity) AS quantity,
      ROUND(SUM(s.quantity * i.cost_price), 2) AS value
    FROM stock_levels s JOIN items i ON i.id = s.item_id JOIN categories c ON c.id = i.category_id
    WHERE s.quantity > 0 GROUP BY c.id, c.name ORDER BY value DESC`);
  await audit.log(req, { action: 'REPORT_VIEWED', entityType: 'Report', entityId: 'stock-valuation' });
  res.json({ data, totalValue: data.reduce((a, r) => a + Number(r.value), 0).toFixed(2) });
};
