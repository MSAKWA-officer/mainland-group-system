const { QueryTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const RETENTION_DAYS = 30;     // a deleted record stays on this page for 30 days, then drops off the list by itself

/* "Deleted records": everything users deleted (stock documents that were reversed, cash sales that were voided).
   Read-only, for the Owner. Shows who deleted it, when and why. Nothing here is ever removed from the database. */
exports.list = async (req, res) => {
  const { type, search, from, to } = req.query;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const rep = { limit, offset: (page - 1) * limit };
  const where = [`deleted_at >= NOW() - INTERVAL '${RETENTION_DAYS} days'`];
  if (type) { where.push('kind = :type'); rep.type = type; }
  if (search) { where.push('(doc_no ILIKE :s OR COALESCE(warehouse_name, \'\') ILIKE :s OR COALESCE(deleted_by_name, \'\') ILIKE :s OR COALESCE(reason, \'\') ILIKE :s)'); rep.s = `%${search}%`; }
  if (from) { where.push('deleted_at >= :from'); rep.from = from; }
  if (to) { where.push('deleted_at < (CAST(:to AS date) + 1)'); rep.to = to; }
  const base = `
    WITH x AS (
      SELECT d.id, d.type AS kind, d.doc_no, d.doc_date AS record_date, w.name AS warehouse_name,
             d.voided_at AS deleted_at, u.full_name AS deleted_by_name, d.void_reason AS reason
        FROM stock_documents d
        LEFT JOIN warehouses w ON w.id = d.warehouse_id
        LEFT JOIN users u ON u.id = d.voided_by
       WHERE d.status = 'VOIDED'
      UNION ALL
      SELECT s.id, 'CASH_SALE' AS kind, s.sale_no, s.sale_date, NULL, s.voided_at, u.full_name, s.void_reason
        FROM sales s
        LEFT JOIN users u ON u.id = s.voided_by
       WHERE s.status = 'VOIDED' AND s.sale_type = 'CASH'
    )`;
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await sequelize.query(`${base} SELECT id, kind AS "type", doc_no AS "docNo", record_date AS "recordDate", warehouse_name AS "warehouse",
      deleted_at AS "deletedAt", deleted_by_name AS "deletedBy", reason FROM x ${w} ORDER BY deleted_at DESC NULLS LAST LIMIT :limit OFFSET :offset`,
    { replacements: rep, type: QueryTypes.SELECT });
  const [{ total }] = await sequelize.query(`${base} SELECT COUNT(*)::int AS total FROM x ${w}`, { replacements: rep, type: QueryTypes.SELECT });
  res.json({ data: rows, total, page, limit, retentionDays: RETENTION_DAYS });
};
