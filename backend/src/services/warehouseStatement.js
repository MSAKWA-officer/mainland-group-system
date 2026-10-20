const { QueryTypes } = require('sequelize');
const { sequelize, Warehouse } = require('../models');

/* Warehouse Inventory Statement: for a period, per product, the opening quantity, what came in, what went out and the closing book balance.
   Everything is read from the warehouse ledger (warehouse_movements, append-only) and the live warehouse_stock.

   Opening / closing quantities are worked back from today's stock, so they stay correct even for stock that existed before the ledger started:
       quantity at moment X  =  quantity now  -  net movement since X

   Which ledger movement types land in which column. Edit HERE if the business wants a different grouping.
   Anything NOT listed (stock adjustments, expired write-offs, new types added later) falls into "Other In" / "Other Out",
   so Book Balance always equals the real stock. */
const IN_COLUMNS = {
  factoryDelivery: ['RECEIVING'],                       // goods received into the warehouse
  fromVehicle: ['TRANSFER_IN', 'TRANSFER_RETURN'],      // received from another warehouse / vehicle (incl. a short-received transfer coming back)
  salesReturn: ['REJECT_IN', 'SALE_CANCEL'],            // customer returns and cancelled sales
};
const OUT_COLUMNS = {
  toVehicle: ['TRANSFER_OUT'],                          // sent to another warehouse / vehicle
  salesOut: ['SALE'],                                   // sold
  damagedOut: ['DAMAGED'],                              // damaged write-off
  toFactory: ['REJECT_OUT'],                            // returned to the factory / supplier
};
const NUM_KEYS = ['monthStart', 'periodStart', 'factoryDelivery', 'fromVehicle', 'salesReturn', 'otherIn',
  'toVehicle', 'salesOut', 'damagedOut', 'toFactory', 'otherOut', 'bookBalance'];

// Business days are in this time zone (override with REPORT_TZ), not the database server's.
const TZ = process.env.REPORT_TZ || 'Africa/Dar_es_Salaam';
const todayLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });   // YYYY-MM-DD
const monthStartOf = (d) => `${d.slice(0, 7)}-01`;
const r3 = (v) => Math.round(Number(v || 0) * 1000) / 1000;

const sumIf = (types, dir, period) => `COALESCE(SUM(m.quantity) FILTER (WHERE m.direction = '${dir}' AND m.movement_type IN (${types.map((x) => `'${x}'`).join(',')}) AND ${period}), 0)`;

// One statement for the given warehouses (their stock is added together). `ids` must not be empty.
async function build({ ids, from, to, title, warehouse = null }) {
  const period = 'm.occurred_at >= b.ps AND m.occurred_at < b.pe';
  const net = (cond) => `COALESCE(SUM(CASE m.direction WHEN 'IN' THEN m.quantity ELSE -m.quantity END) FILTER (WHERE ${cond}), 0)`;
  const inCols = Object.entries(IN_COLUMNS).map(([k, v]) => `${sumIf(v, 'IN', period)} AS "${k}"`);
  const outCols = Object.entries(OUT_COLUMNS).map(([k, v]) => `${sumIf(v, 'OUT', period)} AS "${k}"`);
  const rows = await sequelize.query(`
    WITH b AS (SELECT CAST(:from AS date)::timestamp AT TIME ZONE :tz AS ps,
                      date_trunc('month', CAST(:from AS date)::timestamp) AT TIME ZONE :tz AS ms,
                      (CAST(:to AS date) + 1)::timestamp AT TIME ZONE :tz AS pe),
    mv AS (
      SELECT m.item_id,
        ${net('m.occurred_at >= b.ms')} AS net_ms, ${net('m.occurred_at >= b.ps')} AS net_ps, ${net('m.occurred_at >= b.pe')} AS net_pe,
        COALESCE(SUM(m.quantity) FILTER (WHERE m.direction = 'IN' AND ${period}), 0) AS in_total,
        COALESCE(SUM(m.quantity) FILTER (WHERE m.direction = 'OUT' AND ${period}), 0) AS out_total,
        ${[...inCols, ...outCols].join(',\n        ')}
      FROM warehouse_movements m CROSS JOIN b
      WHERE m.warehouse_id IN (:ids) AND m.occurred_at >= b.ms
      GROUP BY m.item_id),
    cur AS (SELECT item_id, SUM(quantity) AS q FROM warehouse_stock WHERE warehouse_id IN (:ids) GROUP BY item_id)
    SELECT i.id AS "itemId", i.sku, i.name, i.unit, i.is_active AS "isActive", c.name AS category,
      COALESCE(cur.q, 0) AS cur, COALESCE(mv.net_ms, 0) AS net_ms, COALESCE(mv.net_ps, 0) AS net_ps, COALESCE(mv.net_pe, 0) AS net_pe,
      COALESCE(mv.in_total, 0) AS in_total, COALESCE(mv.out_total, 0) AS out_total,
      ${[...Object.keys(IN_COLUMNS), ...Object.keys(OUT_COLUMNS)].map((k) => `COALESCE(mv."${k}", 0) AS "${k}"`).join(', ')}
    FROM items i LEFT JOIN categories c ON c.id = i.category_id LEFT JOIN cur ON cur.item_id = i.id LEFT JOIN mv ON mv.item_id = i.id
    ORDER BY c.name NULLS LAST, i.name, i.sku`,
  { replacements: { ids, from, to, tz: TZ }, type: QueryTypes.SELECT });

  const out = [];
  for (const r of rows) {
    const known = (cols) => Object.keys(cols).reduce((a, k) => a + Number(r[k]), 0);
    const line = {
      itemId: r.itemId, code: r.sku, name: r.name, unit: r.unit,
      monthStart: r3(Number(r.cur) - Number(r.net_ms)), periodStart: r3(Number(r.cur) - Number(r.net_ps)),
      factoryDelivery: r3(r.factoryDelivery), fromVehicle: r3(r.fromVehicle), salesReturn: r3(r.salesReturn),
      otherIn: r3(Number(r.in_total) - known(IN_COLUMNS)),
      toVehicle: r3(r.toVehicle), salesOut: r3(r.salesOut), damagedOut: r3(r.damagedOut), toFactory: r3(r.toFactory),
      otherOut: r3(Number(r.out_total) - known(OUT_COLUMNS)),
      bookBalance: r3(Number(r.cur) - Number(r.net_pe)),
    };
    // Active products always appear (like the paper form); inactive ones only when something happened to them.
    if (r.isActive || NUM_KEYS.some((k) => line[k] !== 0)) out.push(line);
  }
  const totals = Object.fromEntries(NUM_KEYS.map((k) => [k, r3(out.reduce((a, l) => a + l[k], 0))]));
  const units = [...new Set(out.map((l) => l.unit).filter(Boolean))];
  return { title, warehouse, from, to, monthStart: monthStartOf(from), unit: units.length === 1 ? units[0] : null,
    generatedAt: new Date().toISOString(), rows: out, totals };
}

const empty = (title, from, to, warehouse = null) => ({ title, warehouse, from, to, monthStart: monthStartOf(from), unit: null,
  generatedAt: new Date().toISOString(), rows: [], totals: Object.fromEntries(NUM_KEYS.map((k) => [k, 0])) });

/* The statements to produce.
   `allowed`  = null (user may see every warehouse) or the ids the user is in charge of.
   `warehouseId` given  -> just that warehouse.
   no warehouseId       -> the combined statement first, then one statement per warehouse (only when `each` and there is more than one). */
async function statements({ allowed, warehouseId, from, to, each }) {
  if (warehouseId) {
    const w = await Warehouse.findByPk(warehouseId);
    return [await build({ ids: [warehouseId], from, to, title: `${w.code} - ${w.name}`, warehouse: { id: w.id, code: w.code, name: w.name } })];
  }
  const all = await Warehouse.findAll({ order: [['code', 'ASC']] });
  const list = all.filter((w) => !allowed || allowed.includes(w.id));
  if (!list.length) return [empty('All warehouses', from, to)];
  const combined = await build({ ids: list.map((w) => w.id), from, to, title: list.length > 1 ? 'All warehouses' : `${list[0].code} - ${list[0].name}`,
    warehouse: list.length > 1 ? null : { id: list[0].id, code: list[0].code, name: list[0].name } });
  if (!each || list.length < 2) return [combined];
  const parts = [];
  for (const w of list) {
    const s = await build({ ids: [w.id], from, to, title: `${w.code} - ${w.name}`, warehouse: { id: w.id, code: w.code, name: w.name } });
    if (w.isActive || s.rows.some((l) => NUM_KEYS.some((k) => l[k] !== 0))) parts.push(s);   // hide inactive warehouses with nothing in them
  }
  return [combined, ...parts];
}

module.exports = { build, statements, todayLocal, monthStartOf, NUM_KEYS, IN_COLUMNS, OUT_COLUMNS };
