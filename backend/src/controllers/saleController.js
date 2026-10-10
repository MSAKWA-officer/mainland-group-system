const { Op, fn, col } = require('sequelize');
const { Sale } = require('../models');
const q = require('../services/saleQueries');

const all = ['CASH', 'CREDIT'];
// The Sales register: cash + credit sales together, read-only. Each type is only included if the user may read it.
exports.list = async (req, res) => res.json(await q.list(req, all, req.query));
exports.getOne = async (req, res) => res.json(await q.fetch(req, req.params.id, all));

// Totals for a period (COMPLETED sales only), per sale type. `outstanding` is the unpaid part of credit sales.
exports.summary = async (req, res) => {
  const { from, to } = req.query;
  const vis = await q.visibility(req, all);
  const where = { [Op.and]: [vis, { status: 'COMPLETED' }, ...(from || to ? [{ saleDate: { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) } }] : [])] };
  const rows = await Sale.findAll({ where, group: ['saleType'], raw: true, attributes: ['saleType',
    [fn('COUNT', col('id')), 'count'], [fn('COALESCE', fn('SUM', col('total')), 0), 'total'],
    [fn('COALESCE', fn('SUM', col('amount_paid')), 0), 'paid'], [fn('COALESCE', fn('SUM', col('discount_total')), 0), 'discounts']] });
  const by = Object.fromEntries(rows.map((r) => [r.saleType, { count: Number(r.count), total: r.total, paid: r.paid, discounts: r.discounts,
    outstanding: (Math.round(Number(r.total) * 100) - Math.round(Number(r.paid) * 100)) / 100 }]));
  const voided = await Sale.count({ where: { [Op.and]: [vis, { status: 'VOIDED' }, ...(from || to ? [{ saleDate: { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) } }] : [])] } });
  const sum = (k) => Object.values(by).reduce((a, r) => a + Math.round(Number(r[k]) * 100), 0) / 100;
  res.json({ from: from ?? null, to: to ?? null, byType: by, grandTotal: sum('total'), totalPaid: sum('paid'), totalOutstanding: sum('outstanding'), voidedCount: voided });
};
