const router = require('express').Router();
const { z, uuid, idParam, paging, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const { STATUSES, STAGES } = require('../services/orderWorkflow');
const c = require('../controllers/orderWorkflowController');

const listQ = z.object({ stage: z.enum(STAGES).optional(), status: z.enum(STATUSES).optional(), search: text(80).optional(), ...paging });
const orderParam = z.object({ orderId: uuid });
const noteS = z.object({ note: text(500).optional() });
const id = validate(idParam, 'params');

// Reading. The controller narrows what each user sees (own orders, own queue, or everything with order_workflow.read_all).
router.get('/', authorize('order_workflow.read'), validate(listQ, 'query'), ah(c.list));
router.get('/summary', authorize('order_workflow.read'), ah(c.summary));
router.get('/order/:orderId', authorize('order_workflow.read'), validate(orderParam, 'params'), ah(c.byOrder));
router.get('/:id', authorize('order_workflow.read'), id, ah(c.getOne));

// Step 2 - Storekeeper
router.post('/:id/storekeeper/verify', authorize('order_workflow.read', 'order_workflow.storekeeper_review'), id, validate(noteS), ah(c.storekeeperVerify));
router.post('/:id/storekeeper/return', authorize('order_workflow.read', 'order_workflow.storekeeper_review'), id, validate(noteS), ah(c.storekeeperReturn));
// Step 3 - Manager (approving issues the stock; the approvals engine re-checks everything inside its transaction)
router.post('/:id/manager/approve', authorize('order_workflow.read', 'order_workflow.manager_review', 'sales_orders.approve'), id, validate(noteS), ah(c.managerApprove));
router.post('/:id/manager/reject', authorize('order_workflow.read', 'order_workflow.manager_review', 'sales_orders.approve'), id, validate(noteS), ah(c.managerReject));
router.post('/:id/manager/return', authorize('order_workflow.read', 'order_workflow.manager_review', 'sales_orders.approve'), id, validate(noteS), ah(c.managerReturn));
// Step 4 - Salesperson confirms the approved order
router.post('/:id/acknowledge', authorize('order_workflow.read', 'order_workflow.acknowledge'), id, validate(noteS), ah(c.acknowledge));
module.exports = router;
