const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const core = require('./saleCore');

/* Fuel reports - read-only, calculated live. Needs fuel_reports.read (managers / owner); the data is NOT limited to "own" records, so grant it with care.
   Only ACTIVE usage and APPROVED fundings are counted. Voided and rejected records never appear.
   1. consumption     - per vehicle: litres, cost, average price, distance, km/litre, litres/100km and cost/km.
   2. reconciliation  - per vehicle or driver: money given vs money spent vs money still unspent.
   3. monthly         - month by month for one year: funded, spent, litres, average price. */
const { cents, str } = core;
const DATE_FILTER = (col) => `(CAST(:from AS date) IS NULL OR ${col} >= CAST(:from AS date)) AND (CAST(:to AS date) IS NULL OR ${col} <= CAST(:to AS date))`;
const run = (sql, rep) => sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT });
const sumCents = (rows, k) => str(rows.reduce((s, r) => s + cents(r[k] ?? 0), 0n));
const sumNum = (rows, k, dp) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0).toFixed(dp);

/* Efficiency uses the full-tank method: distance between two readings is only counted when BOTH fills filled the tank,
   and it is divided by the litres of the later fill. Fills without an odometer reading still count for litres and cost. */
async function consumption({ from, to, vehicleId }) {
  const rep = { from: from ?? null, to: to ?? null, vid: vehicleId ?? null };
  const vf = '(CAST(:vid AS uuid) IS NULL OR vehicle_id = CAST(:vid AS uuid))';
  const rows = await run(`
    WITH seq AS (
      SELECT vehicle_id, usage_date, litres, amount, odometer_km, is_full_tank,
             LAG(odometer_km) OVER w AS prev_odo, LAG(is_full_tank) OVER w AS prev_full
      FROM fuel_usages WHERE status = 'ACTIVE' AND odometer_km IS NOT NULL AND ${vf}
      WINDOW w AS (PARTITION BY vehicle_id ORDER BY odometer_km, usage_date, created_at)
    ), eff AS (
      SELECT vehicle_id, SUM(odometer_km - prev_odo) AS km, SUM(litres) AS litres, SUM(amount) AS amount
      FROM seq WHERE is_full_tank AND prev_full AND prev_odo IS NOT NULL AND odometer_km > prev_odo AND ${DATE_FILTER('usage_date')}
      GROUP BY vehicle_id
    ), tot AS (
      SELECT vehicle_id, COUNT(*)::int AS fills, SUM(litres) AS litres, SUM(amount) AS amount
      FROM fuel_usages WHERE status = 'ACTIVE' AND ${vf} AND ${DATE_FILTER('usage_date')} GROUP BY vehicle_id
    )
    SELECT v.id, v.code, v.plate_no AS "plateNo", v.fuel_type AS "fuelType", tot.fills, tot.litres::text AS litres, tot.amount::text AS amount,
      ROUND(tot.amount / NULLIF(tot.litres, 0), 2)::text AS "avgPricePerLitre", COALESCE(eff.km, 0)::text AS "distanceKm",
      ROUND(eff.km / NULLIF(eff.litres, 0), 2)::text AS "kmPerLitre", ROUND(eff.litres * 100 / NULLIF(eff.km, 0), 2)::text AS "litresPer100Km",
      ROUND(eff.amount / NULLIF(eff.km, 0), 2)::text AS "costPerKm"
    FROM tot JOIN vehicles v ON v.id = tot.vehicle_id LEFT JOIN eff ON eff.vehicle_id = tot.vehicle_id
    ORDER BY tot.amount DESC, v.plate_no`, rep);
  return { from: from ?? null, to: to ?? null, totals: { fills: rows.reduce((s, r) => s + r.fills, 0), litres: sumNum(rows, 'litres', 3), amount: sumCents(rows, 'amount') }, rows };
}

// Fundings are picked by the date the money was given out (disbursed_on); the usage counted is the usage recorded against those fundings.
async function reconciliation({ from, to, groupBy }) {
  const byVehicle = groupBy === 'vehicle';
  const [id, label] = byVehicle ? ['v.id', 'v.plate_no'] : ['d.id', 'd.full_name'];
  const rows = await run(`
    SELECT ${id} AS id, ${label} AS label, COUNT(*)::int AS fundings, COUNT(*) FILTER (WHERE f.amount - COALESCE(u.used, 0) > 0)::int AS "openFundings",
      SUM(f.amount)::text AS funded, COALESCE(SUM(u.used), 0)::text AS used, SUM(f.amount - COALESCE(u.used, 0))::text AS balance,
      ROUND(COALESCE(SUM(u.used), 0) * 100 / NULLIF(SUM(f.amount), 0), 1)::text AS "usedPercent",
      COALESCE(SUM(f.litres), 0)::text AS "fundedLitres", COALESCE(SUM(u.litres), 0)::text AS "usedLitres"
    FROM fuel_fundings f JOIN vehicles v ON v.id = f.vehicle_id JOIN drivers d ON d.id = f.driver_id
    LEFT JOIN (SELECT fuel_funding_id, SUM(amount) AS used, SUM(litres) AS litres FROM fuel_usages WHERE status = 'ACTIVE' GROUP BY fuel_funding_id) u ON u.fuel_funding_id = f.id
    WHERE f.status = 'APPROVED' AND ${DATE_FILTER('f.disbursed_on')} GROUP BY ${id}, ${label} ORDER BY SUM(f.amount) DESC, ${label}`, { from: from ?? null, to: to ?? null });
  const funded = rows.reduce((s, r) => s + cents(r.funded), 0n);
  const used = rows.reduce((s, r) => s + cents(r.used), 0n);
  return { groupBy, from: from ?? null, to: to ?? null, totals: { fundings: rows.reduce((s, r) => s + r.fundings, 0), funded: str(funded), used: str(used), balance: str(funded - used),
    usedPercent: funded > 0n ? String(Number((used * 1000n) / funded) / 10) : '0' }, rows };
}

async function monthly({ year, vehicleId, driverId }) {
  const rows = await run(`
    SELECT g.m AS month, to_char(make_date(CAST(:year AS int), g.m, 1), 'YYYY-MM') AS period, COALESCE(fu.funded, 0)::text AS funded,
      COALESCE(us.fills, 0) AS fills, COALESCE(us.litres, 0)::text AS litres, COALESCE(us.used, 0)::text AS used, ROUND(us.used / NULLIF(us.litres, 0), 2)::text AS "avgPricePerLitre"
    FROM generate_series(1, 12) AS g(m)
    LEFT JOIN LATERAL (SELECT SUM(f.amount) AS funded FROM fuel_fundings f WHERE f.status = 'APPROVED'
        AND f.disbursed_on >= make_date(CAST(:year AS int), g.m, 1) AND f.disbursed_on < (make_date(CAST(:year AS int), g.m, 1) + INTERVAL '1 month')::date
        AND (CAST(:vid AS uuid) IS NULL OR f.vehicle_id = CAST(:vid AS uuid)) AND (CAST(:did AS uuid) IS NULL OR f.driver_id = CAST(:did AS uuid))) fu ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*)::int AS fills, SUM(x.litres) AS litres, SUM(x.amount) AS used FROM fuel_usages x WHERE x.status = 'ACTIVE'
        AND x.usage_date >= make_date(CAST(:year AS int), g.m, 1) AND x.usage_date < (make_date(CAST(:year AS int), g.m, 1) + INTERVAL '1 month')::date
        AND (CAST(:vid AS uuid) IS NULL OR x.vehicle_id = CAST(:vid AS uuid)) AND (CAST(:did AS uuid) IS NULL OR x.driver_id = CAST(:did AS uuid))) us ON TRUE
    ORDER BY g.m`, { year, vid: vehicleId ?? null, did: driverId ?? null });
  const litres = rows.reduce((s, r) => s + Number(r.litres), 0);
  const used = rows.reduce((s, r) => s + cents(r.used), 0n);
  return { year, vehicleId: vehicleId ?? null, driverId: driverId ?? null, rows,
    totals: { funded: sumCents(rows, 'funded'), used: str(used), litres: litres.toFixed(3), fills: rows.reduce((s, r) => s + r.fills, 0),
      avgPricePerLitre: litres > 0 ? str((used * 1000n + BigInt(Math.round(litres * 1000)) / 2n) / BigInt(Math.round(litres * 1000))) : null } };
}

module.exports = { consumption, reconciliation, monthly };
