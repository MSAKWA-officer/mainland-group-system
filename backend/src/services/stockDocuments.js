const { sequelize, StockDocument, StockDocumentLine, Item, StockBatch } = require('../models');
const approvals = require('./approvals');
const audit = require('./audit');
const ledger = require('./stockLedger');
const { AppError } = require('../utils/errors');

/* One engine for all six stock documents. Lifecycle:
   DRAFT -> (submit) SUBMITTED -> (approve) POSTED   | (reject) REJECTED | (cancel) CANCELLED
   Stock changes ONLY when the document is posted (see stockLedger). Types with `autoPost: true` (Stock receiving, Stock adjustment) need NO approval:
   they are posted straight to stock the moment they are saved. All other types register an approval type with its own permission,
   e.g. `adjustments.approve`, and the requester can never approve their own document. */
const TYPES = {
  RECEIVING:  { label: 'Stock receiving',            prefix: 'RCV', module: 'receiving',   approval: 'STOCK_RECEIVING',   direction: 'IN',  reasonRequired: false, autoPost: true },
  ADJUSTMENT: { label: 'Stock adjustment',           prefix: 'ADJ', module: 'adjustments', approval: 'STOCK_ADJUSTMENT',  direction: null,  reasonRequired: true,  autoPost: true },
  REJECT_IN:  { label: 'Reject in (customer return)', prefix: 'RIN', module: 'reject_in',   approval: 'STOCK_REJECT_IN',   direction: 'IN',  reasonRequired: true },
  REJECT_OUT: { label: 'Reject out (return to supplier)', prefix: 'ROU', module: 'reject_out', approval: 'STOCK_REJECT_OUT', direction: 'OUT', reasonRequired: true },
  EXPIRED:    { label: 'Expired stock write-off',    prefix: 'EXP', module: 'expired',     approval: 'STOCK_EXPIRED',     direction: 'OUT', reasonRequired: false },
  DAMAGED:    { label: 'Damaged stock write-off',    prefix: 'DMG', module: 'damaged',     approval: 'STOCK_DAMAGED',     direction: 'OUT', reasonRequired: true },
};

const bad = (field, message) => new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message }]);
const snapshot = (d, n) => ({ docNo: d.docNo, type: d.type, status: d.status, docDate: d.docDate, partyName: d.partyName,
  reference: d.reference, reason: d.reason, ...(n != null && { lines: n }) });
const loadDoc = async (id, type, t) => {
  const d = await StockDocument.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!d || d.type !== type) throw new AppError(404, 'NOT_FOUND', 'Document not found');
  return d;
};
const mustOwn = (req, doc, what) => {
  if (doc.createdBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', `Only the creator can ${what} this document`);
};

// Validates lines against the live item / batch data and returns rows ready to insert.
async function normalizeLines(type, lines, t) {
  const cfg = TYPES[type];
  const items = await Item.findAll({ where: { id: [...new Set(lines.map((l) => l.itemId))] }, transaction: t });
  const byItem = new Map(items.map((i) => [i.id, i]));
  const bids = [...new Set(lines.map((l) => l.batchId).filter(Boolean))];
  const byBatch = new Map((bids.length ? await StockBatch.findAll({ where: { id: bids }, transaction: t }) : []).map((b) => [b.id, b]));
  return lines.map((l, i) => {
    const f = (k) => `lines.${i}.${k}`;
    const item = byItem.get(l.itemId);
    if (!item) throw bad(f('itemId'), 'Item not found');
    const direction = cfg.direction || l.direction;
    if (direction === 'IN' && !item.isActive) throw bad(f('itemId'), 'This item is inactive');
    if (type === 'EXPIRED' && !item.trackExpiry) throw bad(f('itemId'), 'Only items that track expiry can be written off as expired');
    const row = { itemId: item.id, direction, quantity: l.quantity, unitCost: direction === 'IN' ? (l.unitCost ?? null) : null,
      remarks: l.remarks ?? null, batchNo: null, expiryDate: null, batchId: null };
    if (item.trackExpiry) {
      if (direction === 'IN') {
        if (!l.batchNo) throw bad(f('batchNo'), 'Batch number is required for this item');
        if (!l.expiryDate) throw bad(f('expiryDate'), 'Expiry date is required for this item');
        row.batchNo = l.batchNo; row.expiryDate = l.expiryDate;
      } else {
        const b = l.batchId && byBatch.get(l.batchId);
        if (!b || b.itemId !== item.id) throw bad(f('batchId'), 'Choose a batch of this item');
        row.batchId = b.id;
      }
    }
    return row;
  });
}

// Posts a document to stock inside the caller's transaction. Used by approval (other types) and directly by autoPost types.
const postNow = async (req, doc, t) => {
  const lines = await StockDocumentLine.findAll({ where: { documentId: doc.id }, order: [['itemId', 'ASC'], ['createdAt', 'ASC']], transaction: t });
  await ledger.post(t, doc, lines, req.user.id);
  await doc.update({ status: 'POSTED', postedAt: new Date() }, { transaction: t });
  await audit.log(req, { action: 'STOCK_POSTED', entityType: 'StockDocument', entityId: doc.id,
    newValues: { docNo: doc.docNo, type: doc.type, lines: lines.length } }, t);
};

const create = (req, type, body) => sequelize.transaction(async (t) => {
  const cfg = TYPES[type];
  const lines = await normalizeLines(type, body.lines, t);
  const [seq] = await sequelize.query("SELECT nextval('stock_doc_seq') AS n", { transaction: t });
  const docNo = `${cfg.prefix}-${new Date().getFullYear()}-${String(seq[0].n).padStart(6, '0')}`;
  const doc = await StockDocument.create({ docNo, type, status: 'DRAFT', ...(body.docDate && { docDate: body.docDate }),
    partyName: body.partyName ?? null, reference: body.reference ?? null, reason: body.reason ?? null, createdBy: req.user.id }, { transaction: t });
  await StockDocumentLine.bulkCreate(lines.map((l) => ({ ...l, documentId: doc.id })), { transaction: t });
  await audit.log(req, { action: 'STOCK_DOC_CREATED', entityType: 'StockDocument', entityId: doc.id, newValues: snapshot(doc, lines.length) }, t);
  if (cfg.autoPost) await postNow(req, doc, t);              // no approval: stock is increased right away, in this same transaction
  return doc;
});

const update = (req, type, id, body) => sequelize.transaction(async (t) => {
  const doc = await loadDoc(id, type, t);
  mustOwn(req, doc, 'edit');
  if (doc.status !== 'DRAFT') throw new AppError(409, 'BAD_STATE', `Cannot edit a document that is ${doc.status}`);
  const old = snapshot(doc);
  const { lines, ...head } = body;
  await doc.update(head, { transaction: t });
  let n;
  if (lines) {
    const rows = await normalizeLines(type, lines, t);
    await StockDocumentLine.destroy({ where: { documentId: doc.id }, transaction: t });
    await StockDocumentLine.bulkCreate(rows.map((l) => ({ ...l, documentId: doc.id })), { transaction: t });
    n = rows.length;
  }
  await audit.log(req, { action: 'STOCK_DOC_UPDATED', entityType: 'StockDocument', entityId: doc.id, oldValues: old, newValues: snapshot(doc, n) }, t);
  return doc;
});

// Submit = create the approval request + submit it + lock the document, all in ONE transaction.
const submit = (req, type, id) => sequelize.transaction(async (t) => {
  const cfg = TYPES[type];
  const doc = await loadDoc(id, type, t);
  mustOwn(req, doc, 'submit');
  if (doc.status !== 'DRAFT') throw new AppError(409, 'BAD_STATE', `Cannot submit a document that is ${doc.status}`);
  if (cfg.reasonRequired && !doc.reason) throw bad('reason', 'A reason is required');
  if (cfg.autoPost) {                                          // old drafts saved before auto-posting: submitting now posts them, no approval
    await normalizeLines(type, (await StockDocumentLine.findAll({ where: { documentId: doc.id }, transaction: t })).map((l) => l.get({ plain: true })), t);
    await postNow(req, doc, t);
    return doc;
  }
  const lines = (await StockDocumentLine.findAll({ where: { documentId: doc.id }, transaction: t })).map((l) => l.get({ plain: true }));
  if (!lines.length) throw bad('lines', 'Add at least one line');
  await normalizeLines(type, lines, t);                       // re-validate: items may have changed since the draft was saved
  const ar = await approvals.create(req, { type: cfg.approval, entityType: 'StockDocument', entityId: doc.id,
    payload: { docNo: doc.docNo, type, lines: lines.length, reason: doc.reason } }, t);
  await approvals.submit(req, ar.id, t);
  const old = snapshot(doc);
  await doc.update({ status: 'SUBMITTED', submittedAt: new Date(), approvalId: ar.id }, { transaction: t });
  await audit.log(req, { action: 'STOCK_DOC_SUBMITTED', entityType: 'StockDocument', entityId: doc.id, oldValues: old, newValues: snapshot(doc, lines.length) }, t);
  return doc;
});

const cancel = async (req, type, id) => {
  const doc = await loadDoc(id, type);
  mustOwn(req, doc, 'cancel');
  if (doc.status === 'SUBMITTED') { await approvals.cancel(req, doc.approvalId); return loadDoc(id, type); } // onCancel hook updates the document
  if (doc.status !== 'DRAFT') throw new AppError(409, 'BAD_STATE', `Cannot cancel a document that is ${doc.status}`);
  return sequelize.transaction(async (t) => {
    const d = await loadDoc(id, type, t);
    if (d.status !== 'DRAFT') throw new AppError(409, 'BAD_STATE', `Cannot cancel a document that is ${d.status}`);
    await d.update({ status: 'CANCELLED' }, { transaction: t });
    await audit.log(req, { action: 'STOCK_DOC_CANCELLED', entityType: 'StockDocument', entityId: d.id, oldValues: { status: 'DRAFT' }, newValues: { status: 'CANCELLED', docNo: d.docNo, type } }, t);
    return d;
  });
};

// Creator (or Owner) may delete a draft / cancelled / rejected document. Submitted and posted documents are never deleted.
const remove = (req, type, id) => sequelize.transaction(async (t) => {
  const doc = await loadDoc(id, type, t);
  if (doc.createdBy !== req.user.id && req.user.role !== 'OWNER') throw new AppError(403, 'FORBIDDEN', 'Only the creator or the Owner can delete this document');
  if (!['DRAFT', 'CANCELLED', 'REJECTED'].includes(doc.status))
    throw new AppError(409, 'BAD_STATE', `A ${doc.status} document cannot be deleted. Cancel it first, or keep it as the permanent record.`);
  const old = snapshot(doc, await StockDocumentLine.count({ where: { documentId: doc.id }, transaction: t }));
  await doc.destroy({ transaction: t });
  await audit.log(req, { action: 'STOCK_DOC_DELETED', entityType: 'StockDocument', entityId: id, oldValues: old }, t);
});

/* ---- approval hooks: called by services/approvals.js inside its transaction ---- */
const postDocument = async (r, ctx) => {
  const t = ctx.transaction;
  const doc = await StockDocument.findByPk(r.entityId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!doc || doc.status !== 'SUBMITTED') throw new AppError(409, 'BAD_STATE', 'This stock document is not waiting for approval');
  await postNow(ctx.req, doc, t);
};
const closeDocument = (status, action) => async (r, ctx) => {
  const t = ctx.transaction;
  const doc = await StockDocument.findByPk(r.entityId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!doc || doc.status !== 'SUBMITTED') return;
  await doc.update({ status }, { transaction: t });
  await audit.log(ctx.req, { action, entityType: 'StockDocument', entityId: doc.id, oldValues: { status: 'SUBMITTED' },
    newValues: { status, docNo: doc.docNo, type: doc.type }, reason: r.decisionNote || undefined }, t);
};

for (const cfg of Object.values(TYPES)) {
  approvals.register(cfg.approval, {
    label: cfg.label, approvePermission: `${cfg.module}.approve`,
    execute: postDocument, onReject: closeDocument('REJECTED', 'STOCK_DOC_REJECTED'), onCancel: closeDocument('CANCELLED', 'STOCK_DOC_CANCELLED'),
  });
}

module.exports = { TYPES, create, update, submit, cancel, remove };
