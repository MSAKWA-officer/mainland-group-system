const express = require('express');
const { z, uuid, idParam, paging, date, text, money, quantity } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const { TYPES } = require('../services/stockDocuments');
const controller = require('../controllers/stockDocumentController');

// One router factory used for all six stock documents. Each type has its own permissions: `<module>.read|create|approve`.
module.exports = (type) => {
  const cfg = TYPES[type]; const m = cfg.module; const c = controller(type); const router = express.Router();

  const line = z.object({
    itemId: uuid, quantity,
    ...(cfg.direction ? {} : { direction: z.enum(['IN', 'OUT']) }),   // adjustments choose + / - per line
    unitCost: money.nullable().optional(), batchNo: text(60).min(1).nullable().optional(), expiryDate: date.nullable().optional(),
    batchId: uuid.nullable().optional(), remarks: text(255).nullable().optional(),
  });
  const reason = cfg.reasonRequired ? text(1000).min(3) : text(1000).nullable().optional();
  const head = { docDate: date, partyName: text(150).nullable(), reference: text(100).nullable(), reason };
  const createS = z.object({ ...Object.fromEntries(Object.entries(head).map(([k, v]) => [k, k === 'reason' ? v : v.optional()])),
    lines: z.array(line).min(1).max(200) });
  const updateS = createS.partial().refine((o) => Object.keys(o).length, 'Nothing to update');
  const listQ = z.object({ status: z.enum(['DRAFT', 'SUBMITTED', 'POSTED', 'REJECTED', 'CANCELLED']).optional(), search: text(80).optional(),
    from: date.optional(), to: date.optional(), createdBy: uuid.optional(), ...paging });
  const note = z.object({ note: text(500).optional() });

  router.get('/', authorize(`${m}.read`), validate(listQ, 'query'), ah(c.list));
  router.post('/', authorize(`${m}.create`), validate(createS), ah(c.create));
  router.get('/:id', authorize(`${m}.read`), validate(idParam, 'params'), ah(c.getOne));
  router.patch('/:id', authorize(`${m}.create`), validate(idParam, 'params'), validate(updateS), ah(c.update));
  router.delete('/:id', authorize(`${m}.create`), validate(idParam, 'params'), ah(c.remove));
  router.post('/:id/submit', authorize(`${m}.create`), validate(idParam, 'params'), ah(c.submit));
  router.post('/:id/cancel', authorize(`${m}.create`), validate(idParam, 'params'), ah(c.cancel));
  router.post('/:id/approve', authorize(`${m}.approve`), validate(idParam, 'params'), validate(note), ah(c.approve));
  router.post('/:id/reject', authorize(`${m}.approve`), validate(idParam, 'params'), validate(note), ah(c.reject));
  return router;
};
