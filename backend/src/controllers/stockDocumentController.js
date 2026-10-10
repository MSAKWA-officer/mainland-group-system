const { Op, literal } = require('sequelize');
const { StockDocument, StockDocumentLine, Item, StockBatch, User, ApprovalRequest } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const svc = require('../services/stockDocuments');
const approvals = require('../services/approvals');

const creator = { model: User, as: 'creator', attributes: ['id', 'username', 'fullName'] };
const approval = { model: ApprovalRequest, as: 'approval', attributes: ['id', 'status', 'decidedBy', 'decidedAt', 'decisionNote'] };
const lines = { model: StockDocumentLine, as: 'lines', include: [
  { model: Item, as: 'item', attributes: ['id', 'sku', 'name', 'unit', 'trackExpiry'] },
  { model: StockBatch, as: 'batch', attributes: ['id', 'batchNo', 'expiryDate'] }] };
const lineCount = literal('(SELECT CAST(COUNT(*) AS int) FROM stock_document_lines l WHERE l.document_id = "StockDocument"."id")');

// One controller per document type (receiving, adjustment, reject in, ...). `type` comes from the route.
module.exports = (type) => {
  const view = (d, req) => {
    const o = d.toJSON();
    if (o.lines && !req.user.permissions.has('items.view_cost')) o.lines.forEach((l) => { delete l.unitCost; });
    return o;
  };
  const fetch = async (id) => {
    const d = await StockDocument.findOne({ where: { id, type }, include: [creator, approval, lines], order: [[{ model: StockDocumentLine, as: 'lines' }, 'createdAt', 'ASC']] });
    if (!d) throw new AppError(404, 'NOT_FOUND', 'Document not found');
    return d;
  };
  const waiting = async (id) => {
    const d = await StockDocument.findOne({ where: { id, type } });
    if (!d) throw new AppError(404, 'NOT_FOUND', 'Document not found');
    if (d.status !== 'SUBMITTED' || !d.approvalId) throw new AppError(409, 'BAD_STATE', `This document is ${d.status}, not waiting for approval`);
    return d;
  };

  return {
    list: async (req, res) => {
      const { status, search, from, to, createdBy, page, limit } = req.query; const where = { type };
      if (status) where.status = status;
      if (createdBy) where.createdBy = createdBy;
      if (from || to) where.docDate = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
      if (search) where[Op.or] = ['docNo', 'partyName', 'reference'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
      const { rows, count } = await StockDocument.findAndCountAll({ where, include: [creator], attributes: { include: [[lineCount, 'lineCount']] },
        order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit });
      res.json({ data: rows, total: count, page, limit });
    },
    getOne: async (req, res) => res.json(view(await fetch(req.params.id), req)),
    create: async (req, res) => res.status(201).json(view(await fetch((await svc.create(req, type, req.body)).id), req)),
    update: async (req, res) => res.json(view(await fetch((await svc.update(req, type, req.params.id, req.body)).id), req)),
    remove: async (req, res) => { await svc.remove(req, type, req.params.id); res.json({ ok: true }); },
    submit: async (req, res) => res.json(view(await fetch((await svc.submit(req, type, req.params.id)).id), req)),
    cancel: async (req, res) => res.json(view(await fetch((await svc.cancel(req, type, req.params.id)).id), req)),
    approve: async (req, res) => {
      const d = await waiting(req.params.id);
      await approvals.approve(req, d.approvalId, req.body.note);         // posts the stock inside the same transaction
      res.json(view(await fetch(d.id), req));
    },
    reject: async (req, res) => {
      const d = await waiting(req.params.id);
      await approvals.reject(req, d.approvalId, req.body.note);
      res.json(view(await fetch(d.id), req));
    },
  };
};
