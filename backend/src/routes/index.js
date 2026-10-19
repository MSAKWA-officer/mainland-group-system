const router = require('express').Router();
const { sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');
const stockDocs = require('./stockDocumentRoutes');

router.get('/health', async (req, res) => {
  try { await sequelize.authenticate(); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
});

router.use('/auth', require('./authRoutes'));                                     // public + self-authenticated
router.use('/users', authenticate, require('./userRoutes'));
router.use('/rbac', authenticate, require('./roleRoutes'));
router.use('/audit-logs', authenticate, require('./auditRoutes'));
router.use('/approvals', authenticate, require('./approvalRoutes'));
router.use('/notifications', authenticate, require('./notificationRoutes'));
router.use('/files', authenticate, require('./fileRoutes'));
router.use('/monitoring', authenticate, require('./monitoringRoutes'));
router.use('/dashboard', authenticate, require('./dashboardRoutes'));

// ---- Phase 2: Inventory ----
router.use('/categories', authenticate, require('./categoryRoutes'));
router.use('/items', authenticate, require('./itemRoutes'));
router.use('/stock', authenticate, require('./stockRoutes'));
router.use('/stock-receiving', authenticate, stockDocs('RECEIVING'));
router.use('/stock-adjustments', authenticate, stockDocs('ADJUSTMENT'));
router.use('/stock-reject-in', authenticate, stockDocs('REJECT_IN'));
router.use('/stock-reject-out', authenticate, stockDocs('REJECT_OUT'));
router.use('/stock-expired', authenticate, stockDocs('EXPIRED'));
router.use('/stock-damaged', authenticate, stockDocs('DAMAGED'));
router.use('/stock-movements', authenticate, require('./movementRoutes'));
router.use('/stock-reports', authenticate, require('./reportRoutes'));

// ---- Phase 3: Sales & Customers ----
router.use('/customers', authenticate, require('./customerRoutes'));
router.use('/salespersons', authenticate, require('./salespersonRoutes'));
router.use('/sales-orders', authenticate, require('./salesOrderRoutes'));
router.use('/discounts', authenticate, require('./discountRoutes'));
router.use('/efd-devices', authenticate, require('./efdDeviceRoutes'));
router.use('/efd-receipts', authenticate, require('./efdReceiptRoutes'));

// ---- Phase 3b / 3c: sales register, cash + credit sales, balances, payment history, credit ageing ----
router.use('/sales', authenticate, require('./saleRoutes'));
router.use('/cash-sales', authenticate, require('./cashSaleRoutes'));
router.use('/credit-sales', authenticate, require('./creditSaleRoutes'));
router.use('/customer-balances', authenticate, require('./customerBalanceRoutes'));
router.use('/payment-history', authenticate, require('./paymentHistoryRoutes'));
router.use('/credit-ageing', authenticate, require('./creditAgeingRoutes'));

// ---- Staff ----
router.use('/staff', authenticate, require('./staffRoutes'));

// ---- Phase 4: Approval workflow ----
router.use('/order-workflow', authenticate, require('./orderWorkflowRoutes'));

// ---- Phase 5: Banking & Payments ----
router.use('/banks', authenticate, require('./bankRoutes'));
router.use('/bank-accounts', authenticate, require('./bankAccountRoutes'));
router.use('/bank-transactions', authenticate, require('./bankTransactionRoutes'));
router.use('/customer-payments', authenticate, require('./customerPaymentRoutes'));
router.use('/expenses', authenticate, require('./expenseRoutes'));
router.use('/payments', authenticate, require('./paymentRoutes'));
router.use('/transfers', authenticate, require('./transferRoutes'));

// ---- Warehouses ----
router.use('/warehouses', authenticate, require('./warehouseRoutes'));
router.use('/warehouse-transfers', authenticate, require('./warehouseTransferRoutes'));

// ---- Phase 6: Fuel ----
router.use('/drivers', authenticate, require('./driverRoutes'));
router.use('/vehicles', authenticate, require('./vehicleRoutes'));
router.use('/fuel-funding', authenticate, require('./fuelFundingRoutes'));
router.use('/fuel-usage', authenticate, require('./fuelUsageRoutes'));
router.use('/fuel-balances', authenticate, require('./fuelBalanceRoutes'));
router.use('/fuel-reports', authenticate, require('./fuelReportRoutes'));

// ---- Phase 7: EFD (Z reports, daily reconciliation, difference detection, reports) ----
router.use('/efd-z-reports', authenticate, require('./efdZReportRoutes'));
router.use('/efd-reconciliations', authenticate, require('./efdReconciliationRoutes'));
router.use('/efd-differences', authenticate, require('./efdDifferenceRoutes'));
router.use('/efd-reports', authenticate, require('./efdReportRoutes'));

module.exports = router;
