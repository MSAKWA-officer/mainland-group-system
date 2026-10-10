const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { like } = require('../utils/schemas');
const core = require('./saleCore');
const zr = require('./efdZReports');

/* EFD reports - read-only, calculated live from the records already in the system (nothing is read from TRA).
   Company-wide fiscal data, so it needs efd_reports.read (managers / owner) and is NOT limited to "own" records. CSV download needs efd_reports.export.
   Only ISSUED receipts count towards sales and VAT; VOIDED receipts are shown separately. Only live Z reports (PENDING / VERIFIED) and live reconciliations (OPEN / RECONCILED) are used.
   Days are trading days in the business time zone (BUSINESS_TZ).
   1. daily       - per device and day: system receipts, the Z report, the difference, and the reconciliation status
   2. devices     - per device over a period: receipts, VAT, voids, Z reports and reconciled days
   3. monthly     - month by month for one year: sales, VAT, voids, verified Z totals and reconciled days (for VAT returns)
   4. receipts    - the receipt register (searchable, paged; CSV gives every row up to the export limit)
   5. unreceipted - confirmed orders that still have no live EFD receipt */
const { cents, str } = core;
const sgn = zr.sgn;
const EXPORT_LIMIT = 20000;
const run = (sql, rep) => sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT });
const sumC = (rows, k) => rows.reduce((s, r) => s + cents(r[k] ?? 0), 0n);
const sumN = (rows, k) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
const DAY = (col) => `CAST(${col} AT TIME ZONE :tz AS date)`;
const IN_RANGE = (col) => `${col} BETWEEN CAST(:from AS date) AND CAST(:to AS date)`;
const DEV = (col) => `(CAST(:dev AS uuid) IS NULL OR ${col} = CAST(:dev AS uuid))`;
const base = ({ from, to, deviceId }) => ({ from, to, dev: deviceId ?? null, tz: zr.TZ });

/* 1. Daily summary */
async function daily(q) {
  const rep = base(q);
  const rows = await run(`WITH rc AS (
      SELECT device_id, ${DAY('issued_at')} AS day, COUNT(*) FILTER (WHERE status = 'ISSUED')::int AS cnt,
        COALESCE(SUM(amount) FILTER (WHERE status = 'ISSUED'), 0) AS gross, COALESCE(SUM(vat_amount) FILTER (WHERE status = 'ISSUED'), 0) AS vat,
        COUNT(*) FILTER (WHERE status = 'VOIDED')::int AS vcnt, COALESCE(SUM(amount) FILTER (WHERE status = 'VOIDED'), 0) AS vamt
      FROM efd_receipts WHERE ${IN_RANGE(DAY('issued_at'))} AND ${DEV('device_id')} GROUP BY device_id, ${DAY('issued_at')}),
    zz AS (SELECT * FROM efd_z_reports WHERE status IN ('PENDING','VERIFIED') AND ${IN_RANGE('report_date')} AND ${DEV('device_id')}),
    rn AS (SELECT * FROM efd_reconciliations WHERE status IN ('OPEN','RECONCILED') AND ${IN_RANGE('recon_date')} AND ${DEV('device_id')}),
    days AS (SELECT device_id, day FROM rc UNION SELECT device_id, report_date FROM zz UNION SELECT device_id, recon_date FROM rn)
    SELECT to_char(k.day, 'YYYY-MM-DD') AS date, k.device_id AS "deviceId", d.serial_no AS "deviceSerial", d.name AS "deviceName",
      COALESCE(rc.cnt, 0) AS "receiptsCount", COALESCE(rc.gross, 0)::numeric(20,2)::text AS "receiptsGross", COALESCE(rc.vat, 0)::numeric(20,2)::text AS "receiptsVat",
      COALESCE(rc.vcnt, 0) AS "voidedCount", COALESCE(rc.vamt, 0)::numeric(20,2)::text AS "voidedAmount",
      zz.report_no AS "zReportNo", zz.z_number AS "zNumber", zz.status AS "zStatus", zz.receipts_count AS "zCount", zz.gross_amount::text AS "zGross", zz.vat_amount::text AS "zVat",
      rn.recon_no AS "reconNo", rn.status AS "reconStatus"
    FROM days k JOIN efd_devices d ON d.id = k.device_id
    LEFT JOIN rc ON rc.device_id = k.device_id AND rc.day = k.day
    LEFT JOIN zz ON zz.device_id = k.device_id AND zz.report_date = k.day
    LEFT JOIN rn ON rn.device_id = k.device_id AND rn.recon_date = k.day
    ORDER BY k.day DESC, d.serial_no LIMIT ${EXPORT_LIMIT}`, rep);
  for (const r of rows) {
    r.grossDifference = r.zReportNo ? sgn(cents(r.zGross) - cents(r.receiptsGross)) : null;       // Z report minus system
    r.vatDifference = r.zReportNo ? sgn(cents(r.zVat) - cents(r.receiptsVat)) : null;
    r.countDifference = r.zReportNo ? r.zCount - r.receiptsCount : null;
    r.hasDifference = !r.zReportNo ? r.receiptsCount > 0 : (cents(r.grossDifference) !== 0n || cents(r.vatDifference) !== 0n || r.countDifference !== 0);
  }
  return { report: 'daily', title: 'EFD daily summary', from: q.from, to: q.to,
    columns: [['date', 'Date'], ['deviceSerial', 'Device'], ['receiptsCount', 'Receipts'], ['receiptsGross', 'System gross'], ['receiptsVat', 'System VAT'],
      ['voidedCount', 'Voided receipts'], ['voidedAmount', 'Voided amount'], ['zReportNo', 'Z report'], ['zNumber', 'Z number'], ['zStatus', 'Z status'], ['zCount', 'Z receipts'],
      ['zGross', 'Z gross'], ['zVat', 'Z VAT'], ['grossDifference', 'Gross difference'], ['vatDifference', 'VAT difference'], ['countDifference', 'Count difference'],
      ['reconNo', 'Reconciliation'], ['reconStatus', 'Reconciliation status']].map(([key, label]) => ({ key, label })),
    totals: { days: rows.length, receiptsCount: sumN(rows, 'receiptsCount'), receiptsGross: str(sumC(rows, 'receiptsGross')), receiptsVat: str(sumC(rows, 'receiptsVat')),
      voidedCount: sumN(rows, 'voidedCount'), voidedAmount: str(sumC(rows, 'voidedAmount')), daysWithDifference: rows.filter((r) => r.hasDifference).length },
    rows };
}

/* 2. Per device */
async function devices(q) {
  const rep = base(q);
  const rows = await run(`SELECT d.id AS "deviceId", d.serial_no AS "deviceSerial", d.name AS "deviceName", d.tin, d.is_active AS "isActive",
      COALESCE(r.cnt, 0) AS "receiptsCount", COALESCE(r.gross, 0)::numeric(20,2)::text AS "receiptsGross", COALESCE(r.vat, 0)::numeric(20,2)::text AS "receiptsVat",
      COALESCE(r.vcnt, 0) AS "voidedCount", COALESCE(r.vamt, 0)::numeric(20,2)::text AS "voidedAmount", to_char(r.last_day, 'YYYY-MM-DD') AS "lastReceiptDate",
      COALESCE(z.cnt, 0) AS "zReports", COALESCE(z.verified, 0) AS "zVerified", COALESCE(c.reconciled, 0) AS "daysReconciled"
    FROM efd_devices d
    LEFT JOIN (SELECT device_id, COUNT(*) FILTER (WHERE status = 'ISSUED')::int AS cnt, SUM(amount) FILTER (WHERE status = 'ISSUED') AS gross, SUM(vat_amount) FILTER (WHERE status = 'ISSUED') AS vat,
        COUNT(*) FILTER (WHERE status = 'VOIDED')::int AS vcnt, SUM(amount) FILTER (WHERE status = 'VOIDED') AS vamt, MAX(${DAY('issued_at')}) AS last_day
      FROM efd_receipts WHERE ${IN_RANGE(DAY('issued_at'))} GROUP BY device_id) r ON r.device_id = d.id
    LEFT JOIN (SELECT device_id, COUNT(*)::int AS cnt, COUNT(*) FILTER (WHERE status = 'VERIFIED')::int AS verified FROM efd_z_reports
      WHERE status IN ('PENDING','VERIFIED') AND ${IN_RANGE('report_date')} GROUP BY device_id) z ON z.device_id = d.id
    LEFT JOIN (SELECT device_id, COUNT(*)::int AS reconciled FROM efd_reconciliations WHERE status = 'RECONCILED' AND ${IN_RANGE('recon_date')} GROUP BY device_id) c ON c.device_id = d.id
    WHERE ${DEV('d.id')} ORDER BY d.is_active DESC, d.serial_no`, rep);
  return { report: 'devices', title: 'EFD sales by device', from: q.from, to: q.to,
    columns: [['deviceSerial', 'Device'], ['deviceName', 'Name'], ['tin', 'TIN'], ['isActive', 'Active'], ['receiptsCount', 'Receipts'], ['receiptsGross', 'Gross'], ['receiptsVat', 'VAT'],
      ['voidedCount', 'Voided receipts'], ['voidedAmount', 'Voided amount'], ['lastReceiptDate', 'Last receipt'], ['zReports', 'Z reports'], ['zVerified', 'Z verified'], ['daysReconciled', 'Days reconciled']]
      .map(([key, label]) => ({ key, label })),
    totals: { receiptsCount: sumN(rows, 'receiptsCount'), receiptsGross: str(sumC(rows, 'receiptsGross')), receiptsVat: str(sumC(rows, 'receiptsVat')),
      voidedCount: sumN(rows, 'voidedCount'), voidedAmount: str(sumC(rows, 'voidedAmount')) },
    rows };
}

/* 3. Month by month (sales and VAT) */
async function monthly({ year, deviceId }) {
  const rep = { year, dev: deviceId ?? null, tz: zr.TZ };
  const rows = await run(`WITH m AS (SELECT generate_series(1, 12) AS month),
    rc AS (SELECT EXTRACT(MONTH FROM ${DAY('issued_at')})::int AS month, COUNT(*) FILTER (WHERE status = 'ISSUED')::int AS cnt,
        COALESCE(SUM(amount) FILTER (WHERE status = 'ISSUED'), 0) AS gross, COALESCE(SUM(vat_amount) FILTER (WHERE status = 'ISSUED'), 0) AS vat,
        COUNT(*) FILTER (WHERE status = 'VOIDED')::int AS vcnt, COALESCE(SUM(amount) FILTER (WHERE status = 'VOIDED'), 0) AS vamt
      FROM efd_receipts WHERE EXTRACT(YEAR FROM ${DAY('issued_at')}) = :year AND ${DEV('device_id')} GROUP BY 1),
    zz AS (SELECT EXTRACT(MONTH FROM report_date)::int AS month, COUNT(*)::int AS cnt, COALESCE(SUM(gross_amount), 0) AS gross, COALESCE(SUM(vat_amount), 0) AS vat
      FROM efd_z_reports WHERE status = 'VERIFIED' AND EXTRACT(YEAR FROM report_date) = :year AND ${DEV('device_id')} GROUP BY 1),
    rn AS (SELECT EXTRACT(MONTH FROM recon_date)::int AS month, COUNT(*)::int AS cnt FROM efd_reconciliations
      WHERE status = 'RECONCILED' AND EXTRACT(YEAR FROM recon_date) = :year AND ${DEV('device_id')} GROUP BY 1)
    SELECT m.month, COALESCE(rc.cnt, 0) AS "receiptsCount", COALESCE(rc.gross, 0)::numeric(20,2)::text AS "receiptsGross", COALESCE(rc.vat, 0)::numeric(20,2)::text AS "receiptsVat",
      (COALESCE(rc.gross, 0) - COALESCE(rc.vat, 0))::numeric(20,2)::text AS "receiptsNet", COALESCE(rc.vcnt, 0) AS "voidedCount", COALESCE(rc.vamt, 0)::numeric(20,2)::text AS "voidedAmount",
      COALESCE(zz.cnt, 0) AS "zVerified", COALESCE(zz.gross, 0)::numeric(20,2)::text AS "zGross", COALESCE(zz.vat, 0)::numeric(20,2)::text AS "zVat", COALESCE(rn.cnt, 0) AS "daysReconciled"
    FROM m LEFT JOIN rc ON rc.month = m.month LEFT JOIN zz ON zz.month = m.month LEFT JOIN rn ON rn.month = m.month ORDER BY m.month`, rep);
  const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  for (const r of rows) r.monthName = NAMES[r.month - 1];
  return { report: 'monthly', title: `EFD monthly summary ${year}`, year,
    columns: [['monthName', 'Month'], ['receiptsCount', 'Receipts'], ['receiptsGross', 'Gross'], ['receiptsVat', 'VAT'], ['receiptsNet', 'Net'], ['voidedCount', 'Voided receipts'],
      ['voidedAmount', 'Voided amount'], ['zVerified', 'Z verified'], ['zGross', 'Z gross (verified)'], ['zVat', 'Z VAT (verified)'], ['daysReconciled', 'Days reconciled']].map(([key, label]) => ({ key, label })),
    totals: { receiptsCount: sumN(rows, 'receiptsCount'), receiptsGross: str(sumC(rows, 'receiptsGross')), receiptsVat: str(sumC(rows, 'receiptsVat')), receiptsNet: str(sumC(rows, 'receiptsNet')),
      voidedCount: sumN(rows, 'voidedCount'), voidedAmount: str(sumC(rows, 'voidedAmount')), zGross: str(sumC(rows, 'zGross')), zVat: str(sumC(rows, 'zVat')) },
    rows };
}

/* 4. Receipt register */
async function receipts(q, { all = false } = {}) {
  const rep = { ...base(q), status: q.status ?? null, search: q.search ? like(q.search) : null };
  const where = `${IN_RANGE(DAY('r.issued_at'))} AND ${DEV('r.device_id')} AND (CAST(:status AS text) IS NULL OR r.status = CAST(:status AS text))
    AND (CAST(:search AS text) IS NULL OR r.receipt_no ILIKE :search OR r.verification_code ILIKE :search OR o.order_no ILIKE :search OR c.name ILIKE :search)`;
  const from = `FROM efd_receipts r JOIN efd_devices d ON d.id = r.device_id JOIN sales_orders o ON o.id = r.sales_order_id JOIN customers c ON c.id = o.customer_id`;
  const rows = await run(`SELECT r.id, r.receipt_no AS "receiptNo", r.verification_code AS "verificationCode", r.issued_at AS "issuedAt", to_char(${DAY('r.issued_at')}, 'YYYY-MM-DD') AS date,
      d.serial_no AS "deviceSerial", o.order_no AS "orderNo", c.name AS "customerName", COALESCE(r.customer_tin, '') AS "customerTin",
      r.amount::text AS amount, r.vat_amount::text AS "vatAmount", (r.amount - r.vat_amount)::text AS net, r.status, r.void_reason AS "voidReason"
    ${from} WHERE ${where} ORDER BY r.issued_at DESC, r.receipt_no DESC LIMIT ${all ? EXPORT_LIMIT : q.limit} ${all ? '' : `OFFSET ${(q.page - 1) * q.limit}`}`, rep);
  const [t] = await run(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE r.status = 'ISSUED')::int AS "issuedCount",
      COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'ISSUED'), 0)::numeric(20,2)::text AS gross, COALESCE(SUM(r.vat_amount) FILTER (WHERE r.status = 'ISSUED'), 0)::numeric(20,2)::text AS vat,
      COUNT(*) FILTER (WHERE r.status = 'VOIDED')::int AS "voidedCount", COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'VOIDED'), 0)::numeric(20,2)::text AS "voidedAmount"
    ${from} WHERE ${where}`, rep);
  return { report: 'receipts', title: 'EFD receipt register', from: q.from, to: q.to,
    columns: [['issuedAt', 'Issued at'], ['deviceSerial', 'Device'], ['receiptNo', 'Receipt no'], ['verificationCode', 'Verification code'], ['orderNo', 'Order'], ['customerName', 'Customer'],
      ['customerTin', 'Customer TIN'], ['amount', 'Gross'], ['vatAmount', 'VAT'], ['net', 'Net'], ['status', 'Status'], ['voidReason', 'Void reason']].map(([key, label]) => ({ key, label })),
    totals: { issuedCount: t.issuedCount, gross: t.gross, vat: t.vat, voidedCount: t.voidedCount, voidedAmount: t.voidedAmount },
    rows, total: t.total, ...(all ? { truncated: t.total > rows.length } : { page: q.page, limit: q.limit }) };
}

/* 5. Confirmed orders without a live EFD receipt */
async function unreceipted(q) {
  const rep = { from: q.from, to: q.to, tz: zr.TZ, today: await zr.today() };
  const rows = await run(`SELECT o.id AS "orderId", o.order_no AS "orderNo", to_char(${DAY('o.confirmed_at')}, 'YYYY-MM-DD') AS date, c.name AS "customerName", COALESCE(c.tin, '') AS "customerTin",
      o.total::text AS total, o.tax_total::text AS "vatAmount", (CAST(:today AS date) - ${DAY('o.confirmed_at')})::int AS "ageDays"
    FROM sales_orders o JOIN customers c ON c.id = o.customer_id
    WHERE o.status = 'CONFIRMED' AND o.confirmed_at IS NOT NULL AND ${IN_RANGE(DAY('o.confirmed_at'))}
      AND NOT EXISTS (SELECT 1 FROM efd_receipts r WHERE r.sales_order_id = o.id AND r.status = 'ISSUED')
    ORDER BY o.confirmed_at DESC LIMIT ${EXPORT_LIMIT}`, rep);
  return { report: 'unreceipted', title: 'Confirmed orders without an EFD receipt', from: q.from, to: q.to,
    columns: [['date', 'Confirmed on'], ['orderNo', 'Order'], ['customerName', 'Customer'], ['customerTin', 'Customer TIN'], ['total', 'Total'], ['vatAmount', 'VAT'], ['ageDays', 'Age (days)']]
      .map(([key, label]) => ({ key, label })),
    totals: { count: rows.length, total: str(sumC(rows, 'total')), vatAmount: str(sumC(rows, 'vatAmount')) }, rows };
}

module.exports = { daily, devices, monthly, receipts, unreceipted, EXPORT_LIMIT };
