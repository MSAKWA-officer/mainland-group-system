const { Op } = require('sequelize');
const { QueryTypes } = require('sequelize');
const { sequelize, EfdReceipt, EfdDevice, Sale, Customer, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');
const { assertDayOpen } = require('../services/efdReconciliations');
const { scope, canSee, canAll, mine } = require('../services/salesScope');

/* EFD numbers: the fiscal receipt number printed by a registered EFD device for a COMPLETED cash or credit sale.
   This system RECORDS the number (entered by the cashier / manager). It does not talk to the TRA / VFD service.
   Amount and VAT are copied from the sale by the server. A recorded receipt can never be edited or deleted: it can only be voided. */
const device = { model: EfdDevice, as: 'device', attributes: ['id', 'serialNo', 'name', 'tin'] };
const user = (as) => ({ model: User, as, attributes: ['id', 'username', 'fullName'] });
const saleInc = (where) => ({ model: Sale, as: 'sale', required: true, attributes: ['id', 'saleNo', 'saleType', 'status', 'customerId', 'walkInName', 'salespersonId', 'total'], ...(where && { where }),
  include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }] });
const bad = (field, message) => new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message }]);
const audited = (r) => ({ deviceId: r.deviceId, saleId: r.saleId, receiptNo: r.receiptNo, verificationCode: r.verificationCode,
  issuedAt: r.issuedAt, amount: r.amount, vatAmount: r.vatAmount, customerTin: r.customerTin, status: r.status });

// A Sales Person only sees receipts of their own sales (same rule as cash / credit sales).
const fetch = async (req, id) => {
  const r = await EfdReceipt.findByPk(id, { include: [device, saleInc(), user('creator'), user('voider')] });
  if (!r || !(await canSee(req, 'efd_receipts.read_all', r.sale.salespersonId))) throw new AppError(404, 'NOT_FOUND', 'EFD receipt not found');
  return r;
};

exports.list = async (req, res) => {
  const { status, deviceId, saleId, search, from, to, page, limit } = req.query; const where = {};
  if (status) where.status = status;
  if (deviceId) where.deviceId = deviceId;
  if (saleId) where.saleId = saleId;
  if (from || to) where.issuedAt = { ...(from && { [Op.gte]: new Date(`${from}T00:00:00.000Z`) }), ...(to && { [Op.lt]: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000) }) };
  if (search) where[Op.or] = [{ receiptNo: { [Op.iLike]: like(search) } }, { verificationCode: { [Op.iLike]: like(search) } }, { '$sale.sale_no$': { [Op.iLike]: like(search) } }];
  const { rows, count } = await EfdReceipt.findAndCountAll({ where, include: [device, saleInc(await scope(req, 'efd_receipts.read_all'))], order: [['issuedAt', 'DESC']],
    limit, offset: (page - 1) * limit, subQuery: false });
  res.json({ data: rows, total: count, page, limit });
};

exports.getOne = async (req, res) => res.json(await fetch(req, req.params.id));

// Completed sales that can still get an EFD number (no live receipt yet). Used by the "Record EFD number" picker.
exports.eligibleSales = async (req, res) => {
  const search = (req.query.search || '').trim();
  const rep = { search: search ? like(search) : null, sp: null, id: req.query.id || null };
  let own = '';
  if (!canAll(req, 'efd_receipts.read_all')) { const sp = await mine(req); rep.sp = sp ? sp.id : '00000000-0000-0000-0000-000000000000'; own = ' AND s.salesperson_id = CAST(:sp AS uuid)'; }
  const rows = await sequelize.query(`SELECT s.id, s.sale_no AS "saleNo", s.sale_type AS "saleType", s.sale_date AS "saleDate", s.total::text AS total,
      COALESCE(c.name, s.walk_in_name, '') AS "customerName"
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.status = 'COMPLETED' AND NOT EXISTS (SELECT 1 FROM efd_receipts r WHERE r.sale_id = s.id AND r.status = 'ISSUED')${own}
      AND (CAST(:id AS uuid) IS NULL OR s.id = CAST(:id AS uuid))
      AND (CAST(:search AS text) IS NULL OR s.sale_no ILIKE :search OR c.name ILIKE :search OR s.walk_in_name ILIKE :search)
    ORDER BY s.sale_date DESC, s.created_at DESC LIMIT 25`, { replacements: rep, type: QueryTypes.SELECT });
  res.json({ data: rows });
};

exports.create = async (req, res) => {
  const { deviceId, saleId, receiptNo, verificationCode, issuedAt } = req.body;
  const id = await sequelize.transaction(async (t) => {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: t.LOCK.UPDATE });    // serialises two people recording a receipt for the same sale
    if (!sale || !(await canSee(req, 'efd_receipts.read_all', sale.salespersonId))) throw bad('saleId', 'Sale not found');
    if (sale.status !== 'COMPLETED') throw new AppError(409, 'BAD_STATE', `EFD receipts can only be recorded for completed sales. This sale is ${sale.status}.`);
    const dev = await EfdDevice.findByPk(deviceId, { transaction: t });
    if (!dev) throw bad('deviceId', 'EFD device not found');
    if (!dev.isActive) throw bad('deviceId', 'This device is inactive');
    const live = await EfdReceipt.findOne({ where: { saleId: sale.id, status: 'ISSUED' }, transaction: t });
    if (live) throw new AppError(409, 'ALREADY_ISSUED', `This sale already has EFD receipt ${live.receiptNo}. Void it first if it must be replaced.`);
    if (await EfdReceipt.findOne({ where: { deviceId: dev.id, receiptNo }, transaction: t }))
      throw new AppError(409, 'DUPLICATE', 'This device already recorded that receipt number', [{ field: 'receiptNo', message: 'Already recorded on this device' }]);
    const when = issuedAt ? new Date(issuedAt) : new Date();
    if (when.getTime() > Date.now() + 5 * 60000) throw bad('issuedAt', 'The receipt time cannot be in the future');
    if (sale.saleDate && when.getTime() < Date.parse(`${sale.saleDate}T00:00:00Z`) - 86400000) throw bad('issuedAt', 'The receipt cannot be dated before the sale');
    await assertDayOpen(dev.id, when, t);                                                              // a reconciled day is closed
    const customer = sale.customerId ? await Customer.findByPk(sale.customerId, { transaction: t }) : null;   // a walk-in cash sale has no customer / TIN
    const r = await EfdReceipt.create({ deviceId: dev.id, saleId: sale.id, receiptNo, verificationCode: verificationCode ?? null, issuedAt: when,
      amount: sale.total, vatAmount: sale.taxTotal, customerTin: customer?.tin ?? null, status: 'ISSUED', createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'EFD_RECEIPT_RECORDED', entityType: 'EfdReceipt', entityId: r.id, newValues: { ...audited(r), saleNo: sale.saleNo, device: dev.serialNo } }, t);
    return r.id;
  });
  res.status(201).json(await fetch(req, id));
};

// Voiding keeps the record (it is a fiscal document) and frees the sale for a new receipt.
exports.void = async (req, res) => {
  const { reason } = req.body;
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a receipt');
  await sequelize.transaction(async (t) => {
    const r = await EfdReceipt.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!r) throw new AppError(404, 'NOT_FOUND', 'EFD receipt not found');
    if (r.status !== 'ISSUED') throw new AppError(409, 'BAD_STATE', 'This receipt is already voided');
    await assertDayOpen(r.deviceId, r.issuedAt, t);                                                    // a reconciled day is closed
    const old = { status: r.status };
    await r.update({ status: 'VOIDED', voidReason: reason.trim(), voidedAt: new Date(), voidedBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'EFD_RECEIPT_VOIDED', entityType: 'EfdReceipt', entityId: r.id, oldValues: old,
      newValues: { status: 'VOIDED', receiptNo: r.receiptNo, saleId: r.saleId }, reason: reason.trim() }, t);
  });
  res.json(await fetch(req, req.params.id));
};
