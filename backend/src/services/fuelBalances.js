const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const core = require('./saleCore');

/* Fuel balances = how much of each APPROVED fuel funding is still unspent. Nothing is stored: it is always calculated live from
   fuel_fundings (money given) and ACTIVE fuel_usages (money spent), so it can never drift out of step.
   - balance = funding amount - ACTIVE usage. Because usage can never exceed the funding, a balance is never negative.
   - state: UNUSED (nothing spent), PARTIAL (some left), SETTLED (fully spent).
   - Without fuel_balances.read_all a user only sees balances of the fundings they raised. Someone else's funding looks like "not found".
   - Read-only: balances change only when a funding is approved / voided or a usage is recorded / edited / voided. */
const { cents, str } = core;
const canAll = (req) => req.user.permissions.has('fuel_balances.read_all');

const USAGE = `(SELECT fuel_funding_id, SUM(amount) AS used, SUM(litres) AS litres, COUNT(*) AS fills, MAX(usage_date) AS last_usage
  FROM fuel_usages WHERE status = 'ACTIVE' GROUP BY fuel_funding_id)`;
const FROM = `FROM fuel_fundings f JOIN vehicles v ON v.id = f.vehicle_id JOIN drivers d ON d.id = f.driver_id LEFT JOIN ${USAGE} u ON u.fuel_funding_id = f.id`;
const LEFT = '(f.amount - COALESCE(u.used, 0))';

const COLS = `f.id, f.funding_no AS "fundingNo", f.disbursed_on::text AS "disbursedOn", f.method, f.purpose,
  f.vehicle_id AS "vehicleId", v.plate_no AS "plateNo", f.driver_id AS "driverId", d.full_name AS "driverName",
  f.amount::text AS funded, COALESCE(u.used, 0)::text AS used, ${LEFT}::text AS balance,
  f.litres::text AS "fundedLitres", COALESCE(u.litres, 0)::text AS "usedLitres", COALESCE(u.fills, 0)::int AS fills, u.last_usage::text AS "lastUsageDate",
  CASE WHEN COALESCE(u.used, 0) = 0 THEN 'UNUSED' WHEN ${LEFT} = 0 THEN 'SETTLED' ELSE 'PARTIAL' END AS state,
  CASE WHEN ${LEFT} > 0 THEN (CURRENT_DATE - f.disbursed_on)::int ELSE 0 END AS "daysOutstanding"`;

function where(req, q, extra = []) {
  const w = ["f.status = 'APPROVED'", ...extra];
  const rep = { uid: req.user.id };
  if (!canAll(req)) w.push('f.created_by = :uid');                                    // a filter can never widen the scope
  if (q.vehicleId) { w.push('f.vehicle_id = :vehicleId'); rep.vehicleId = q.vehicleId; }
  if (q.driverId) { w.push('f.driver_id = :driverId'); rep.driverId = q.driverId; }
  if (q.from) { w.push('f.disbursed_on >= CAST(:from AS date)'); rep.from = q.from; }
  if (q.to) { w.push('f.disbursed_on <= CAST(:to AS date)'); rep.to = q.to; }
  if (q.state === 'OPEN') w.push(`${LEFT} > 0`);
  if (q.state === 'SETTLED') w.push(`${LEFT} = 0`);
  if (q.search) { w.push('(f.funding_no ILIKE :s OR v.plate_no ILIKE :s OR d.full_name ILIKE :s)'); rep.s = like(q.search); }
  return { sql: `WHERE ${w.join(' AND ')}`, rep };
}
const SORT = { disbursedOn: 'f.disbursed_on', balance: LEFT, funded: 'f.amount', fundingNo: 'f.funding_no' };

async function list(req, q) {
  const { sql, rep } = where(req, q);
  const rows = await sequelize.query(`SELECT ${COLS} ${FROM} ${sql} ORDER BY ${SORT[q.sortBy]} ${q.sortDir === 'asc' ? 'ASC' : 'DESC'}, f.funding_no DESC LIMIT :limit OFFSET :offset`,
    { replacements: { ...rep, limit: q.limit, offset: (q.page - 1) * q.limit }, type: QueryTypes.SELECT });
  const [t] = await sequelize.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(f.amount), 0)::text AS funded, COALESCE(SUM(COALESCE(u.used, 0)), 0)::text AS used,
      COALESCE(SUM(${LEFT}), 0)::text AS balance ${FROM} ${sql}`, { replacements: rep, type: QueryTypes.SELECT });
  return { data: rows, total: t.total, page: q.page, limit: q.limit, totals: { funded: t.funded, used: t.used, balance: t.balance } };
}

// One funding: its balance plus every ACTIVE usage line that makes it up.
async function getOne(req, fundingId) {
  const { sql, rep } = where(req, {}, ['f.id = :fid']);
  const [row] = await sequelize.query(`SELECT ${COLS} ${FROM} ${sql}`, { replacements: { ...rep, fid: fundingId }, type: QueryTypes.SELECT });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Approved fuel funding not found');
  const usages = await sequelize.query(`SELECT id, usage_no AS "usageNo", usage_date::text AS "usageDate", litres::text AS litres, amount::text AS amount,
      price_per_litre::text AS "pricePerLitre", odometer_km::text AS "odometerKm", is_full_tank AS "isFullTank", station, receipt_no AS "receiptNo"
    FROM fuel_usages WHERE fuel_funding_id = :fid AND status = 'ACTIVE' ORDER BY usage_date, created_at`, { replacements: { fid: fundingId }, type: QueryTypes.SELECT });
  return { ...row, usages };
}

// Balances added up per vehicle (default) or per driver: how much money each one is still holding.
async function summary(req, q) {
  const byVehicle = q.groupBy === 'vehicle';
  const [id, label] = byVehicle ? ['v.id', 'v.plate_no'] : ['d.id', 'd.full_name'];
  const { sql, rep } = where(req, q);
  const rows = await sequelize.query(`SELECT ${id} AS id, ${label} AS label, COUNT(*)::int AS fundings,
      COUNT(*) FILTER (WHERE ${LEFT} > 0)::int AS "openFundings", SUM(f.amount)::text AS funded, COALESCE(SUM(u.used), 0)::text AS used, SUM(${LEFT})::text AS balance,
      COALESCE(SUM(f.litres), 0)::text AS "fundedLitres", COALESCE(SUM(u.litres), 0)::text AS "usedLitres"
    ${FROM} ${sql} GROUP BY ${id}, ${label} ORDER BY SUM(${LEFT}) DESC, ${label}`, { replacements: rep, type: QueryTypes.SELECT });
  const sum = (k) => str(rows.reduce((s, r) => s + cents(r[k]), 0n));
  return { groupBy: q.groupBy, state: q.state, totals: { funded: sum('funded'), used: sum('used'), balance: sum('balance') }, rows };
}

module.exports = { list, getOne, summary };
