const { Op } = require('sequelize');
const { sequelize, EfdReceipt, EfdDevice, SalesOrder, Customer, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');
const { assertDayOpen } = require('../services/efdReconciliations');
const { scope, canSee } = require('../services/salesScope');

/* EFD numbers: the fiscal receipt number printed by a registered EFD device for a CONFIRMED sales order.
   This system RECORDS the number (entered by the cashier / manager). It does not talk to the TRA / VFD service.
   Amount and VAT are copied from the order by the server. A recorded receipt can never be edited or deleted: it can only be voided. */
const device = { model: EfdDevice, as: 'device', attributes: ['id', 'serialNo', 'name', 'tin'] };
const user = (as) => ({ model: User, as, attributes: ['id', 'username', 'fullName'] });
const orderInc = (where) => ({ model: SalesOrder, as: 'order', required: true, attributes: ['id', 'orderNo', 'status', 'customerId', 'salespersonId', 'total'], ...(where && { where }) });
const bad = (field, message) => new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message }]);
const audited = (r) => ({ deviceId: r.deviceId, salesOrderId: r.salesOrderId, receiptNo: r.receiptNo, verificationCode: r.verificationCode,
  issuedAt: r.issuedAt, amount: r.amount, vatAmount: r.vatAmount, customerTin: r.customerTin, status: r.status });

// A Sales Person only sees receipts of their own orders (same rule as sales orders).
const fetch = async (req, id) => {
  const r = await EfdReceipt.findByPk(id, { include: [device, orderInc(), user('creator'), user('voider')] });
  if (!r || !(await canSee(req, 'efd_receipts.read_all', r.order.salespersonId))) throw new AppError(404, 'NOT_FOUND', 'EFD receipt not found');
  return r;
};

exports.list = async (req, res) => {
  const { status, deviceId, salesOrderId, search, from, to, page, limit } = req.query; const where = {};
  if (status) where.status = status;
  if (deviceId) where.deviceId = deviceId;
  if (salesOrderId) where.salesOrderId = salesOrderId;
  if (from || to) where.issuedAt = { ...(from && { [Op.gte]: new Date(`${from}T00:00:00.000Z`) }), ...(to && { [Op.lt]: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000) }) };
  if (search) where[Op.or] = [{ receiptNo: { [Op.iLike]: like(search) } }, { verificationCode: { [Op.iLike]: like(search) } }, { '$order.order_no$': { [Op.iLike]: like(search) } }];
  const { rows, count } = await EfdReceipt.findAndCountAll({ where, include: [device, orderInc(await scope(req, 'efd_receipts.read_all'))], order: [['issuedAt', 'DESC']],
    limit, offset: (page - 1) * limit, subQuery: false });
  res.json({ data: rows, total: count, page, limit });
};

exports.getOne = async (req, res) => res.json(await fetch(req, req.params.id));

exports.create = async (req, res) => {
  const { deviceId, salesOrderId, receiptNo, verificationCode, issuedAt } = req.body;
  const id = await sequelize.transaction(async (t) => {
    const order = await SalesOrder.findByPk(salesOrderId, { transaction: t, lock: t.LOCK.UPDATE });    // serialises two people recording a receipt for the same order
    if (!order) throw bad('salesOrderId', 'Sales order not found');
    if (order.status !== 'CONFIRMED') throw new AppError(409, 'BAD_STATE', `EFD receipts can only be recorded for confirmed orders. This order is ${order.status}.`);
    const dev = await EfdDevice.findByPk(deviceId, { transaction: t });
    if (!dev) throw bad('deviceId', 'EFD device not found');
    if (!dev.isActive) throw bad('deviceId', 'This device is inactive');
    const live = await EfdReceipt.findOne({ where: { salesOrderId: order.id, status: 'ISSUED' }, transaction: t });
    if (live) throw new AppError(409, 'ALREADY_ISSUED', `This order already has EFD receipt ${live.receiptNo}. Void it first if it must be replaced.`);
    if (await EfdReceipt.findOne({ where: { deviceId: dev.id, receiptNo }, transaction: t }))
      throw new AppError(409, 'DUPLICATE', 'This device already recorded that receipt number', [{ field: 'receiptNo', message: 'Already recorded on this device' }]);
    const when = issuedAt ? new Date(issuedAt) : new Date();
    if (when.getTime() > Date.now() + 5 * 60000) throw bad('issuedAt', 'The receipt time cannot be in the future');
    if (when.getTime() < Date.parse(`${order.orderDate}T00:00:00Z`) - 86400000) throw bad('issuedAt', 'The receipt cannot be dated before the order');
    await assertDayOpen(dev.id, when, t);                                                              // a reconciled day is closed
    const customer = await Customer.findByPk(order.customerId, { transaction: t });
    const r = await EfdReceipt.create({ deviceId: dev.id, salesOrderId: order.id, receiptNo, verificationCode: verificationCode ?? null, issuedAt: when,
      amount: order.total, vatAmount: order.taxTotal, customerTin: customer?.tin ?? null, status: 'ISSUED', createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'EFD_RECEIPT_RECORDED', entityType: 'EfdReceipt', entityId: r.id, newValues: { ...audited(r), orderNo: order.orderNo, device: dev.serialNo } }, t);
    return r.id;
  });
  res.status(201).json(await fetch(req, id));
};

// Voiding keeps the record (it is a fiscal document) and frees the order for a new receipt.
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
      newValues: { status: 'VOIDED', receiptNo: r.receiptNo, salesOrderId: r.salesOrderId }, reason: reason.trim() }, t);
  });
  res.json(await fetch(req, req.params.id));
};
