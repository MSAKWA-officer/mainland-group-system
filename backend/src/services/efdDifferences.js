const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { AppError } = require('../utils/errors');
const zr = require('./efdZReports');

/* EFD difference detection = a read-only scan that looks for things that do not add up in the fiscal records. Nothing is written.
   Only the live records count (Z reports PENDING / VERIFIED, reconciliations OPEN / RECONCILED, receipts ISSUED unless a rule says otherwise).
   The trading day is judged in the business time zone (BUSINESS_TZ). A day that is not over yet (today) is never reported as "missing" something.
   Rules (type -> severity):
     Z_MISSING              receipts exist for a device on a past day but no Z report was recorded ................ HIGH
     Z_MISMATCH             Z report gross / VAT / receipt count differs from the receipts in the system ........... HIGH (gross or VAT) / MEDIUM (count only)
     Z_NUMBER_GAP           the device's Z counter jumped (e.g. Z 41 then Z 44): Z reports are missing ............. HIGH
     UNRECEIPTED_ORDER      a completed sale has no live EFD receipt (2+ days old HIGH, 1 day MEDIUM, today LOW) .... see left
     RECEIPT_AMOUNT_MISMATCH a live receipt's amount / VAT differs from its (frozen) sale ......................... HIGH
     RECEIPT_NUMBER_GAP     receipt numbers of a device skip a number (e.g. ...0105 then ...0108) ................. MEDIUM
     RECON_MISSING          a past day has a Z report but no reconciliation ......................................... MEDIUM
     Z_PENDING_OLD          a Z report is still waiting for verification after 2+ days ............................. LOW
     RECON_DRIFT            a RECONCILED day no longer matches the receipts now in the system ...................... HIGH
   Company-wide fiscal data: needs efd_differences.read (managers / owner), it is NOT limited to "own" records. */
const { cents } = require('./saleCore');
const sgn = zr.sgn;

const TYPES = {
  Z_MISSING: 'No Z report for a day with receipts',
  Z_MISMATCH: 'Z report differs from the system receipts',
  Z_NUMBER_GAP: 'Z report numbers skipped',
  UNRECEIPTED_ORDER: 'Completed sale without an EFD receipt',   // the code keeps its old name; it now means a sale
  RECEIPT_AMOUNT_MISMATCH: 'Receipt differs from its sale',
  RECEIPT_NUMBER_GAP: 'Receipt numbers skipped',
  RECON_MISSING: 'Day not reconciled',
  Z_PENDING_OLD: 'Z report waiting for verification',
  RECON_DRIFT: 'Reconciled day no longer matches',
};
const SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'];
const RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const MAX_DAYS = 92;
const CAP = 5000;                                                          // per rule, so one noisy rule can never flood the response

const run = (sql, rep) => sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT });
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);   // whole days between two YYYY-MM-DD strings
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Receipts of one device per trading day (live figures + voided count). Used by several rules.
const RECEIPT_DAYS = `rc AS (
  SELECT r.device_id, CAST(r.issued_at AT TIME ZONE :tz AS date) AS day,
    COUNT(*) FILTER (WHERE r.status = 'ISSUED')::int AS cnt, COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'ISSUED'), 0) AS gross,
    COALESCE(SUM(r.vat_amount) FILTER (WHERE r.status = 'ISSUED'), 0) AS vat, COUNT(*)::int AS all_cnt
  FROM efd_receipts r
  WHERE CAST(r.issued_at AT TIME ZONE :tz AS date) BETWEEN CAST(:from AS date) AND CAST(:to AS date) AND (CAST(:dev AS uuid) IS NULL OR r.device_id = CAST(:dev AS uuid))
  GROUP BY r.device_id, CAST(r.issued_at AT TIME ZONE :tz AS date))`;
const devJoin = 'JOIN efd_devices d ON d.id = x.device_id';
const DEV_FILTER = '(CAST(:dev AS uuid) IS NULL OR z.device_id = CAST(:dev AS uuid))';

const f = (type, severity, row, extra) => ({
  key: `${type}:${row.deviceId ?? '-'}:${row.date}:${row.ref ?? ''}`, type, typeLabel: TYPES[type], severity,
  deviceId: row.deviceId ?? null, deviceSerial: row.deviceSerial ?? null, date: row.date, ...extra,
});

/* ---------- the rules ---------- */
async function zMissing(rep) {
  const rows = await run(`WITH ${RECEIPT_DAYS}
    SELECT x.device_id AS "deviceId", d.serial_no AS "deviceSerial", to_char(x.day, 'YYYY-MM-DD') AS date, x.cnt, x.all_cnt AS "allCount", x.gross::text AS gross
    FROM rc x ${devJoin}
    WHERE x.day < CAST(:today AS date)
      AND NOT EXISTS (SELECT 1 FROM efd_z_reports z WHERE z.device_id = x.device_id AND z.report_date = x.day AND z.status IN ('PENDING','VERIFIED'))
    ORDER BY x.day DESC LIMIT ${CAP}`, rep);
  return rows.map((r) => f('Z_MISSING', 'HIGH', r, {
    message: `${r.deviceSerial} has ${r.allCount} receipt(s) on ${r.date} but no Z report was recorded`,
    expected: null, actual: { receiptsCount: r.cnt, grossAmount: r.gross }, difference: null, refs: {},
  }));
}

async function zMismatch(rep) {
  const rows = await run(`WITH ${RECEIPT_DAYS}
    SELECT z.id AS "zReportId", z.report_no AS "reportNo", z.status, z.device_id AS "deviceId", d.serial_no AS "deviceSerial", to_char(z.report_date, 'YYYY-MM-DD') AS date,
      z.gross_amount::text AS "zGross", z.vat_amount::text AS "zVat", z.receipts_count AS "zCount",
      COALESCE(x.gross, 0)::numeric(20,2)::text AS "sGross", COALESCE(x.vat, 0)::numeric(20,2)::text AS "sVat", COALESCE(x.cnt, 0) AS "sCount"
    FROM efd_z_reports z JOIN efd_devices d ON d.id = z.device_id
    LEFT JOIN rc x ON x.device_id = z.device_id AND x.day = z.report_date
    WHERE z.status IN ('PENDING','VERIFIED') AND z.report_date BETWEEN CAST(:from AS date) AND CAST(:to AS date) AND ${DEV_FILTER}
      AND (z.gross_amount <> COALESCE(x.gross, 0) OR z.vat_amount <> COALESCE(x.vat, 0) OR z.receipts_count <> COALESCE(x.cnt, 0))
    ORDER BY z.report_date DESC LIMIT ${CAP}`, rep);
  return rows.map((r) => {
    const gross = cents(r.zGross) - cents(r.sGross); const vat = cents(r.zVat) - cents(r.sVat); const count = r.zCount - r.sCount;
    return f('Z_MISMATCH', gross !== 0n || vat !== 0n ? 'HIGH' : 'MEDIUM', { ...r, ref: r.reportNo }, {
      message: `Z report ${r.reportNo} (${r.deviceSerial}, ${r.date}) differs from the receipts recorded in the system`,
      expected: { receiptsCount: r.sCount, grossAmount: r.sGross, vatAmount: r.sVat },       // what the system recorded
      actual: { receiptsCount: r.zCount, grossAmount: r.zGross, vatAmount: r.zVat },         // what the device Z report says
      difference: { receiptsCount: count, grossAmount: sgn(gross), vatAmount: sgn(vat) },    // Z report minus system
      refs: { zReportId: r.zReportId, reportNo: r.reportNo, zStatus: r.status },
    });
  });
}

async function zNumberGap(rep) {
  const rows = await run(`SELECT * FROM (
      SELECT z.id AS "zReportId", z.report_no AS "reportNo", z.device_id AS "deviceId", d.serial_no AS "deviceSerial", z.report_date,
        CAST(z.z_number AS numeric) AS zn, LAG(CAST(z.z_number AS numeric)) OVER w AS prev_zn, LAG(z.z_number) OVER w AS prev_z_number
      FROM efd_z_reports z JOIN efd_devices d ON d.id = z.device_id
      WHERE z.status IN ('PENDING','VERIFIED') AND ${DEV_FILTER}
      WINDOW w AS (PARTITION BY z.device_id ORDER BY CAST(z.z_number AS numeric))) q
    WHERE prev_zn IS NOT NULL AND zn - prev_zn > 1 AND report_date BETWEEN CAST(:from AS date) AND CAST(:to AS date)
    ORDER BY report_date DESC LIMIT ${CAP}`, rep);
  return rows.map((r) => {
    const date = new Date(r.report_date).toISOString().slice(0, 10);
    const missing = Number(r.zn) - Number(r.prev_zn) - 1;
    return f('Z_NUMBER_GAP', 'HIGH', { ...r, date, ref: r.reportNo }, {
      message: `${r.deviceSerial}: Z ${r.prev_z_number} is followed by Z ${r.zn}. ${missing} Z report(s) are missing`,
      expected: { zNumber: String(Number(r.prev_zn) + 1) }, actual: { zNumber: String(r.zn) }, difference: { missingCount: missing },
      refs: { zReportId: r.zReportId, reportNo: r.reportNo },
    });
  });
}

// Sales have no device, so this rule is skipped when the scan is limited to one device.
// (The rule code keeps its old name UNRECEIPTED_ORDER; it now looks at completed cash and credit sales.)
async function unreceiptedOrders(rep) {
  if (rep.dev) return [];
  const rows = await run(`SELECT s.id AS "saleId", s.sale_no AS "saleNo", s.sale_type AS "saleType", s.total::text AS total,
      COALESCE(c.name, s.walk_in_name, '') AS "customerName", to_char(s.sale_date, 'YYYY-MM-DD') AS date
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.status = 'COMPLETED' AND s.sale_date BETWEEN CAST(:from AS date) AND CAST(:to AS date)
      AND NOT EXISTS (SELECT 1 FROM efd_receipts r WHERE r.sale_id = s.id AND r.status = 'ISSUED')
    ORDER BY s.sale_date DESC, s.created_at DESC LIMIT ${CAP}`, rep);
  return rows.map((r) => {
    const age = dayDiff(rep.today, r.date);
    return f('UNRECEIPTED_ORDER', age >= 2 ? 'HIGH' : age === 1 ? 'MEDIUM' : 'LOW', { ...r, ref: r.saleNo }, {
      message: `Sale ${r.saleNo} (${r.customerName}) was completed on ${r.date} and still has no EFD receipt`,
      expected: null, actual: { grossAmount: r.total }, difference: null, ageDays: age, refs: { saleId: r.saleId, saleNo: r.saleNo, saleType: r.saleType },
    });
  });
}

async function receiptAmountMismatch(rep) {
  const rows = await run(`SELECT r.id AS "receiptId", r.receipt_no AS "receiptNo", r.device_id AS "deviceId", d.serial_no AS "deviceSerial", s.id AS "saleId", s.sale_no AS "saleNo", s.sale_type AS "saleType",
      to_char(CAST(r.issued_at AT TIME ZONE :tz AS date), 'YYYY-MM-DD') AS date,
      r.amount::text AS "rAmount", r.vat_amount::text AS "rVat", s.total::text AS "oTotal", s.tax_total::text AS "oVat"
    FROM efd_receipts r JOIN sales s ON s.id = r.sale_id JOIN efd_devices d ON d.id = r.device_id
    WHERE r.status = 'ISSUED' AND CAST(r.issued_at AT TIME ZONE :tz AS date) BETWEEN CAST(:from AS date) AND CAST(:to AS date)
      AND (CAST(:dev AS uuid) IS NULL OR r.device_id = CAST(:dev AS uuid)) AND (r.amount <> s.total OR r.vat_amount <> s.tax_total)
    ORDER BY r.issued_at DESC LIMIT ${CAP}`, rep);
  return rows.map((r) => f('RECEIPT_AMOUNT_MISMATCH', 'HIGH', { ...r, ref: r.receiptNo }, {
    message: `Receipt ${r.receiptNo} (${r.deviceSerial}) does not match sale ${r.saleNo}`,
    expected: { grossAmount: r.oTotal, vatAmount: r.oVat }, actual: { grossAmount: r.rAmount, vatAmount: r.rVat },
    difference: { grossAmount: sgn(cents(r.rAmount) - cents(r.oTotal)), vatAmount: sgn(cents(r.rVat) - cents(r.oVat)) },
    refs: { receiptId: r.receiptId, receiptNo: r.receiptNo, saleId: r.saleId, saleNo: r.saleNo, saleType: r.saleType },
  }));
}

/* A receipt number such as "TZ-000105" is split into a prefix ("TZ-") and a counter (105). Within one device and prefix the counters
   should be consecutive. Voided receipts keep their number, so they count. Numbers without trailing digits are ignored. */
async function receiptNumberGap(rep) {
  const rows = await run(`SELECT * FROM (
      SELECT r.id AS "receiptId", r.receipt_no AS "receiptNo", r.device_id AS "deviceId", d.serial_no AS "deviceSerial", r.issued_at,
        CAST(substring(r.receipt_no FROM '[0-9]+$') AS numeric) AS n,
        LAG(CAST(substring(r.receipt_no FROM '[0-9]+$') AS numeric)) OVER w AS prev_n, LAG(r.receipt_no) OVER w AS prev_no
      FROM efd_receipts r JOIN efd_devices d ON d.id = r.device_id
      WHERE r.receipt_no ~ '[0-9]+$' AND (CAST(:dev AS uuid) IS NULL OR r.device_id = CAST(:dev AS uuid))
      WINDOW w AS (PARTITION BY r.device_id, regexp_replace(r.receipt_no, '[0-9]+$', '') ORDER BY CAST(substring(r.receipt_no FROM '[0-9]+$') AS numeric))) q
    WHERE prev_n IS NOT NULL AND n - prev_n > 1 AND CAST(issued_at AT TIME ZONE :tz AS date) BETWEEN CAST(:from AS date) AND CAST(:to AS date)
    ORDER BY issued_at DESC LIMIT ${CAP}`, rep);
  return rows.map((r) => {
    const missing = Number(r.n) - Number(r.prev_n) - 1;
    return f('RECEIPT_NUMBER_GAP', 'MEDIUM', { ...r, date: new Date(r.issued_at).toISOString().slice(0, 10), ref: r.receiptNo }, {
      message: `${r.deviceSerial}: receipt ${r.prev_no} is followed by ${r.receiptNo}. ${missing} receipt number(s) are not recorded`,
      expected: { receiptNo: r.prev_no }, actual: { receiptNo: r.receiptNo }, difference: { missingCount: missing }, refs: { receiptId: r.receiptId, receiptNo: r.receiptNo },
    });
  });
}

async function reconMissing(rep) {
  const rows = await run(`SELECT z.id AS "zReportId", z.report_no AS "reportNo", z.status, z.device_id AS "deviceId", d.serial_no AS "deviceSerial", to_char(z.report_date, 'YYYY-MM-DD') AS date
    FROM efd_z_reports z JOIN efd_devices d ON d.id = z.device_id
    WHERE z.status IN ('PENDING','VERIFIED') AND z.report_date < CAST(:today AS date) AND z.report_date BETWEEN CAST(:from AS date) AND CAST(:to AS date) AND ${DEV_FILTER}
      AND NOT EXISTS (SELECT 1 FROM efd_reconciliations c WHERE c.device_id = z.device_id AND c.recon_date = z.report_date AND c.status IN ('OPEN','RECONCILED'))
    ORDER BY z.report_date DESC LIMIT ${CAP}`, rep);
  return rows.map((r) => f('RECON_MISSING', 'MEDIUM', { ...r, ref: r.reportNo }, {
    message: `${r.deviceSerial} on ${r.date}: Z report ${r.reportNo} has not been reconciled`,
    expected: null, actual: null, difference: null, refs: { zReportId: r.zReportId, reportNo: r.reportNo, zStatus: r.status },
  }));
}

async function zPendingOld(rep) {
  const rows = await run(`SELECT z.id AS "zReportId", z.report_no AS "reportNo", z.device_id AS "deviceId", d.serial_no AS "deviceSerial", to_char(z.report_date, 'YYYY-MM-DD') AS date
    FROM efd_z_reports z JOIN efd_devices d ON d.id = z.device_id
    WHERE z.status = 'PENDING' AND z.report_date <= CAST(:today AS date) - 2 AND z.report_date BETWEEN CAST(:from AS date) AND CAST(:to AS date) AND ${DEV_FILTER}
    ORDER BY z.report_date DESC LIMIT ${CAP}`, rep);
  return rows.map((r) => f('Z_PENDING_OLD', 'LOW', { ...r, ref: r.reportNo }, {
    message: `Z report ${r.reportNo} (${r.deviceSerial}, ${r.date}) has been waiting for verification for ${dayDiff(rep.today, r.date)} days`,
    expected: null, actual: null, difference: null, ageDays: dayDiff(rep.today, r.date), refs: { zReportId: r.zReportId, reportNo: r.reportNo },
  }));
}

// Receipts cannot be recorded or voided on a reconciled day (see assertDayOpen), so a drift means something bypassed the application.
async function reconDrift(rep) {
  const rows = await run(`WITH ${RECEIPT_DAYS}
    SELECT c.id AS "reconId", c.recon_no AS "reconNo", c.device_id AS "deviceId", d.serial_no AS "deviceSerial", to_char(c.recon_date, 'YYYY-MM-DD') AS date,
      c.receipts_gross::text AS "rGross", c.receipts_vat::text AS "rVat", c.receipts_count AS "rCount",
      COALESCE(x.gross, 0)::numeric(20,2)::text AS "sGross", COALESCE(x.vat, 0)::numeric(20,2)::text AS "sVat", COALESCE(x.cnt, 0) AS "sCount"
    FROM efd_reconciliations c JOIN efd_devices d ON d.id = c.device_id
    LEFT JOIN rc x ON x.device_id = c.device_id AND x.day = c.recon_date
    WHERE c.status = 'RECONCILED' AND c.recon_date BETWEEN CAST(:from AS date) AND CAST(:to AS date) AND (CAST(:dev AS uuid) IS NULL OR c.device_id = CAST(:dev AS uuid))
      AND (c.receipts_gross <> COALESCE(x.gross, 0) OR c.receipts_vat <> COALESCE(x.vat, 0) OR c.receipts_count <> COALESCE(x.cnt, 0))
    ORDER BY c.recon_date DESC LIMIT ${CAP}`, rep);
  return rows.map((r) => f('RECON_DRIFT', 'HIGH', { ...r, ref: r.reconNo }, {
    message: `Reconciliation ${r.reconNo} (${r.deviceSerial}, ${r.date}) no longer matches the receipts in the system`,
    expected: { receiptsCount: r.rCount, grossAmount: r.rGross, vatAmount: r.rVat },    // what was signed off
    actual: { receiptsCount: r.sCount, grossAmount: r.sGross, vatAmount: r.sVat },      // what the system holds now
    difference: { receiptsCount: r.sCount - r.rCount, grossAmount: sgn(cents(r.sGross) - cents(r.rGross)), vatAmount: sgn(cents(r.sVat) - cents(r.rVat)) },
    refs: { reconId: r.reconId, reconNo: r.reconNo },
  }));
}

const RULES = { Z_MISSING: zMissing, Z_MISMATCH: zMismatch, Z_NUMBER_GAP: zNumberGap, UNRECEIPTED_ORDER: unreceiptedOrders,
  RECEIPT_AMOUNT_MISMATCH: receiptAmountMismatch, RECEIPT_NUMBER_GAP: receiptNumberGap, RECON_MISSING: reconMissing, Z_PENDING_OLD: zPendingOld, RECON_DRIFT: reconDrift };

/* ---------- the scan ---------- */
async function scan(req, q) {
  const today = await zr.today();
  const to = q.to ?? today;
  const from = q.from ?? addDays(to, -29);
  if (from > to) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'from', message: '"from" must not be after "to"' }]);
  if (dayDiff(to, from) + 1 > MAX_DAYS) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'from', message: `Scan at most ${MAX_DAYS} days at a time` }]);
  if (to > today) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'to', message: 'The end date cannot be in the future' }]);
  const rep = { from, to, today, tz: zr.TZ, dev: q.deviceId ?? null };
  const wanted = q.type ? [q.type] : Object.keys(RULES);
  const all = (await Promise.all(wanted.map((t) => RULES[t](rep)))).flat();
  const shown = q.severity ? all.filter((x) => x.severity === q.severity) : all;
  shown.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || (a.key < b.key ? -1 : 1));

  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const byType = Object.fromEntries(wanted.map((t) => [t, 0]));
  for (const x of all) { bySeverity[x.severity]++; byType[x.type]++; }
  return {
    from, to, timezone: zr.TZ, generatedAt: new Date().toISOString(), deviceId: q.deviceId ?? null,
    summary: { total: all.length, bySeverity, byType },
    data: shown.slice((q.page - 1) * q.limit, q.page * q.limit), total: shown.length, page: q.page, limit: q.limit,
    capped: Object.values(byType).some((n) => n >= CAP),
  };
}

const types = () => Object.entries(TYPES).map(([code, label]) => ({ code, label }));
module.exports = { scan, types, TYPES, SEVERITIES, MAX_DAYS };
