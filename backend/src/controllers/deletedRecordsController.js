const { QueryTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const RETENTION_DAYS = 30;     // a deleted record stays on this page for 30 days, then drops off the list by itself

/* "Deleted records": 
   Everything a user deleted: reversed stock documents, voided cash / credit sales, reversed warehouse transfers, and records that were removed
   outright (drafts, sales orders, customers, items, banks ... read back from the audit trail). Read-only, for the Owner. */
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
      -- reversed stock documents (receiving, adjustment, reject in/out, expired, damaged ...)
      SELECT d.id::text AS id, d.type AS kind, d.doc_no, d.doc_date AS record_date, w.name AS warehouse_name,
             d.voided_at AS deleted_at, u.full_name AS deleted_by_name, d.void_reason AS reason
        FROM stock_documents d
        LEFT JOIN warehouses w ON w.id = d.warehouse_id
        LEFT JOIN users u ON u.id = d.voided_by
       WHERE d.status = 'VOIDED'
      UNION ALL
      -- voided cash and credit sales
      SELECT s.id::text, CASE s.sale_type WHEN 'CASH' THEN 'CASH_SALE' ELSE 'CREDIT_SALE' END, s.sale_no, s.sale_date, NULL, s.voided_at, u.full_name, s.void_reason
        FROM sales s
        LEFT JOIN users u ON u.id = s.voided_by
       WHERE s.status = 'VOIDED' AND s.sale_type IN ('CASH', 'CREDIT')
      UNION ALL
      -- reversed warehouse transfers
      SELECT t.id::text, 'WAREHOUSE_TRANSFER', t.transfer_no, t.transfer_date, NULL, t.voided_at, u.full_name, t.void_reason
        FROM warehouse_transfers t
        LEFT JOIN users u ON u.id = t.voided_by
       WHERE t.status = 'VOIDED'
      UNION ALL
      -- records that were really removed (drafts, sales orders, customers, items, banks ...): the audit trail keeps what they looked like
      SELECT a.entity_id, CASE a.action WHEN 'STOCK_DOC_DELETED' THEN COALESCE(a.old_values->>'type', 'STOCK_DOC') ELSE regexp_replace(a.action, '_DELETED$', '') END,
             COALESCE(a.old_values->>'docNo', a.old_values->>'orderNo', a.old_values->>'saleNo', a.old_values->>'transferNo', a.old_values->>'code',
                      a.old_values->>'sku', a.old_values->>'accountNo', a.old_values->>'serialNo', a.old_values->>'plateNo', a.old_values->>'fullName',
                      a.old_values->>'name', a.entity_id, '—'),
             CASE WHEN COALESCE(a.old_values->>'docDate', a.old_values->>'orderDate', a.old_values->>'saleDate') ~ '^\\d{4}-\\d{2}-\\d{2}'
                  THEN LEFT(COALESCE(a.old_values->>'docDate', a.old_values->>'orderDate', a.old_values->>'saleDate'), 10)::date END,
             w.name, a.occurred_at, COALESCE(u.full_name, a.username), a.reason
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.user_id
        LEFT JOIN warehouses w ON w.id::text = a.old_values->>'warehouseId'
       WHERE a.action LIKE '%\\_DELETED' AND a.outcome = 'SUCCESS'
    )`;
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await sequelize.query(`${base} SELECT id, kind AS "type", doc_no AS "docNo", record_date AS "recordDate", warehouse_name AS "warehouse",
      deleted_at AS "deletedAt", deleted_by_name AS "deletedBy", reason FROM x ${w} ORDER BY deleted_at DESC NULLS LAST LIMIT :limit OFFSET :offset`,
    { replacements: rep, type: QueryTypes.SELECT });
  const [{ total }] = await sequelize.query(`${base} SELECT COUNT(*)::int AS total FROM x ${w}`, { replacements: rep, type: QueryTypes.SELECT });
  res.json({ data: rows, total, page, limit, retentionDays: RETENTION_DAYS });
};
