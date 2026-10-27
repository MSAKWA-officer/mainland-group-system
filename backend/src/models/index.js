const { Sequelize } = require('sequelize');
const sequelize = require('../config/sequelize');
const Role = require('./Role');
const Permission = require('./Permission');
const RolePermission = require('./RolePermission');
const User = require('./User');
const Session = require('./Session');
const AuditLog = require('./AuditLog');
const ApprovalRequest = require('./ApprovalRequest');
const Notification = require('./Notification');
const Attachment = require('./Attachment');
// Phase 2 - Inventory
const Category = require('./Category');
const Item = require('./Item');
const StockLevel = require('./StockLevel');
const StockBatch = require('./StockBatch');
const StockDocument = require('./StockDocument');
const StockDocumentLine = require('./StockDocumentLine');
const StockMovement = require('./StockMovement');
// Phase 3 - Sales & Customers
const Salesperson = require('./Salesperson');
const Customer = require('./Customer');
const SalesOrder = require('./SalesOrder');
const SalesOrderLine = require('./SalesOrderLine');
const Discount = require('./Discount');
const EfdDevice = require('./EfdDevice');
const EfdReceipt = require('./EfdReceipt');
const EfdZReport = require('./EfdZReport');
const EfdReconciliation = require('./EfdReconciliation');
// Phase 3b - Cash and credit sales
const Sale = require('./Sale');
const SaleLine = require('./SaleLine');
const SalePayment = require('./SalePayment');
// Staff register
const Staff = require('./Staff');

// Warehouses
const Warehouse = require('./Warehouse');
const WarehouseStorekeeper = require('./WarehouseStorekeeper');
const WarehouseStock = require('./WarehouseStock');
const WarehouseItemSetting = require('./WarehouseItemSetting');
const WarehouseTransfer = require('./WarehouseTransfer');
const WarehouseTransferLine = require('./WarehouseTransferLine');
const PhysicalCount = require('./PhysicalCount');
const PhysicalCountLine = require('./PhysicalCountLine');
// Phase 4 - Approval workflow
const OrderWorkflow = require('./OrderWorkflow');
const OrderWorkflowEvent = require('./OrderWorkflowEvent');
// Phase 5 - Banking & Payments
const Bank = require('./Bank');
const BankAccount = require('./BankAccount');
const BankTransaction = require('./BankTransaction');
const Expense = require('./Expense');
const Payment = require('./Payment');
const CustomerPayment = require('./CustomerPayment');
const CustomerPaymentAllocation = require('./CustomerPaymentAllocation');
// Phase 6 - Fuel
const Driver = require('./Driver');
const Vehicle = require('./Vehicle');
const FuelFunding = require('./FuelFunding');
const FuelUsage = require('./FuelUsage');

// Associations
Role.belongsToMany(Permission, { through: RolePermission, as: 'permissions', foreignKey: 'roleId', otherKey: 'permissionId' });
Permission.belongsToMany(Role, { through: RolePermission, as: 'roles', foreignKey: 'permissionId', otherKey: 'roleId' });
User.belongsTo(Role, { as: 'role', foreignKey: 'roleId' });
Role.hasMany(User, { as: 'users', foreignKey: 'roleId' });
Session.belongsTo(User, { foreignKey: 'userId' });
ApprovalRequest.belongsTo(User, { as: 'requester', foreignKey: 'requestedBy' });
ApprovalRequest.belongsTo(User, { as: 'decider', foreignKey: 'decidedBy' });
Attachment.belongsTo(User, { as: 'uploader', foreignKey: 'uploadedBy' });

// Phase 2 - Inventory associations
Category.belongsTo(Category, { as: 'parent', foreignKey: 'parentId' });
Category.hasMany(Category, { as: 'children', foreignKey: 'parentId' });
Category.hasMany(Item, { as: 'items', foreignKey: 'categoryId' });
Item.belongsTo(Category, { as: 'category', foreignKey: 'categoryId' });
Item.hasOne(StockLevel, { as: 'stock', foreignKey: 'itemId' });
StockLevel.belongsTo(Item, { as: 'item', foreignKey: 'itemId' });
Item.hasMany(StockBatch, { as: 'batches', foreignKey: 'itemId' });
StockBatch.belongsTo(Item, { as: 'item', foreignKey: 'itemId' });
StockDocument.hasMany(StockDocumentLine, { as: 'lines', foreignKey: 'documentId' });
StockDocumentLine.belongsTo(StockDocument, { as: 'document', foreignKey: 'documentId' });
StockDocumentLine.belongsTo(Item, { as: 'item', foreignKey: 'itemId' });
StockDocumentLine.belongsTo(StockBatch, { as: 'batch', foreignKey: 'batchId' });
StockDocument.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
StockDocument.belongsTo(ApprovalRequest, { as: 'approval', foreignKey: 'approvalId' });
StockMovement.belongsTo(Item, { as: 'item', foreignKey: 'itemId' });
StockMovement.belongsTo(StockBatch, { as: 'batch', foreignKey: 'batchId' });
StockMovement.belongsTo(User, { as: 'performer', foreignKey: 'performedBy' });
StockMovement.belongsTo(StockDocument, { as: 'document', foreignKey: 'documentId' });

// Phase 3 - Sales & Customers associations
Salesperson.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Salesperson.hasMany(Customer, { as: 'customers', foreignKey: 'salespersonId' });
Salesperson.hasMany(SalesOrder, { as: 'orders', foreignKey: 'salespersonId' });
Customer.belongsTo(Salesperson, { as: 'salesperson', foreignKey: 'salespersonId' });
Customer.hasMany(SalesOrder, { as: 'orders', foreignKey: 'customerId' });
SalesOrder.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId' });
SalesOrder.belongsTo(Salesperson, { as: 'salesperson', foreignKey: 'salespersonId' });
SalesOrder.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
SalesOrder.belongsTo(ApprovalRequest, { as: 'approval', foreignKey: 'approvalId' });
SalesOrder.belongsTo(StockDocument, { as: 'stockDocument', foreignKey: 'stockDocumentId' });
SalesOrder.hasMany(SalesOrderLine, { as: 'lines', foreignKey: 'orderId' });
SalesOrderLine.belongsTo(SalesOrder, { as: 'order', foreignKey: 'orderId' });
SalesOrderLine.belongsTo(Item, { as: 'item', foreignKey: 'itemId' });

// Phase 3 (part 2) - Discounts and EFD numbers associations
Discount.belongsTo(Category, { as: 'category', foreignKey: 'categoryId' });
Discount.belongsTo(Item, { as: 'item', foreignKey: 'itemId' });
Discount.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId' });
Discount.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Discount.hasMany(SalesOrderLine, { as: 'lines', foreignKey: 'discountId' });
SalesOrderLine.belongsTo(Discount, { as: 'discount', foreignKey: 'discountId' });
EfdDevice.hasMany(EfdReceipt, { as: 'receipts', foreignKey: 'deviceId' });
EfdReceipt.belongsTo(EfdDevice, { as: 'device', foreignKey: 'deviceId' });
EfdReceipt.belongsTo(SalesOrder, { as: 'order', foreignKey: 'salesOrderId' });
EfdReceipt.belongsTo(Sale, { as: 'sale', foreignKey: 'saleId' });
Sale.hasMany(EfdReceipt, { as: 'efdReceipts', foreignKey: 'saleId' });
SalesOrder.hasMany(EfdReceipt, { as: 'efdReceipts', foreignKey: 'salesOrderId' });
EfdReceipt.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
EfdReceipt.belongsTo(User, { as: 'voider', foreignKey: 'voidedBy' });

// Phase 3b - Cash and credit sales associations
Sale.belongsTo(SalesOrder, { as: 'order', foreignKey: 'salesOrderId' });
SalesOrder.hasOne(Sale, { as: 'sale', foreignKey: 'salesOrderId' });
Sale.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId' });
Customer.hasMany(Sale, { as: 'sales', foreignKey: 'customerId' });
Sale.belongsTo(Salesperson, { as: 'salesperson', foreignKey: 'salespersonId' });
Salesperson.hasMany(Sale, { as: 'sales', foreignKey: 'salespersonId' });
Sale.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Sale.belongsTo(ApprovalRequest, { as: 'approval', foreignKey: 'approvalId' });
Sale.belongsTo(StockDocument, { as: 'stockDocument', foreignKey: 'stockDocumentId' });
Sale.hasMany(SaleLine, { as: 'lines', foreignKey: 'saleId' });
SaleLine.belongsTo(Sale, { as: 'sale', foreignKey: 'saleId' });
SaleLine.belongsTo(Item, { as: 'item', foreignKey: 'itemId' });
Sale.hasMany(SalePayment, { as: 'payments', foreignKey: 'saleId' });
SalePayment.belongsTo(Sale, { as: 'sale', foreignKey: 'saleId' });
SalePayment.belongsTo(User, { as: 'receiver', foreignKey: 'receivedBy' });
SalePayment.belongsTo(BankAccount, { as: 'bankAccount', foreignKey: 'bankAccountId' });

// Staff register association
Staff.belongsTo(User, { as: 'user', foreignKey: 'userId' });

// Phase 4 - Approval workflow associations
OrderWorkflow.belongsTo(SalesOrder, { as: 'order', foreignKey: 'orderId' });
SalesOrder.hasOne(OrderWorkflow, { as: 'workflow', foreignKey: 'orderId' });
OrderWorkflow.belongsTo(ApprovalRequest, { as: 'approval', foreignKey: 'approvalId' });
OrderWorkflow.belongsTo(User, { as: 'submitter', foreignKey: 'submittedBy' });
OrderWorkflow.belongsTo(User, { as: 'storekeeper', foreignKey: 'storekeeperId' });
OrderWorkflow.belongsTo(User, { as: 'manager', foreignKey: 'managerId' });
OrderWorkflow.belongsTo(User, { as: 'returner', foreignKey: 'returnedBy' });
OrderWorkflow.belongsTo(User, { as: 'completer', foreignKey: 'completedBy' });
OrderWorkflow.hasMany(OrderWorkflowEvent, { as: 'events', foreignKey: 'workflowId' });
OrderWorkflowEvent.belongsTo(OrderWorkflow, { as: 'workflow', foreignKey: 'workflowId' });
OrderWorkflowEvent.belongsTo(User, { as: 'actor', foreignKey: 'actorId' });

// Phase 5 - Banking & Payments associations
Bank.hasMany(BankAccount, { as: 'accounts', foreignKey: 'bankId' });
Bank.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
BankAccount.belongsTo(Bank, { as: 'bank', foreignKey: 'bankId' });
BankAccount.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
BankAccount.hasMany(BankTransaction, { as: 'transactions', foreignKey: 'bankAccountId' });
BankTransaction.belongsTo(BankAccount, { as: 'account', foreignKey: 'bankAccountId' });
BankTransaction.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
BankTransaction.belongsTo(User, { as: 'voider', foreignKey: 'voidedBy' });
BankTransaction.belongsTo(User, { as: 'reconciler', foreignKey: 'reconciledBy' });
BankTransaction.belongsTo(CustomerPayment, { as: 'customerPayment', foreignKey: 'customerPaymentId' });
CustomerPayment.hasMany(BankTransaction, { as: 'bankTransactions', foreignKey: 'customerPaymentId' });
CustomerPayment.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId' });
Customer.hasMany(CustomerPayment, { as: 'payments', foreignKey: 'customerId' });
CustomerPayment.belongsTo(BankAccount, { as: 'bankAccount', foreignKey: 'bankAccountId' });
CustomerPayment.belongsTo(User, { as: 'receiver', foreignKey: 'receivedBy' });
CustomerPayment.belongsTo(User, { as: 'voider', foreignKey: 'voidedBy' });
CustomerPayment.hasMany(CustomerPaymentAllocation, { as: 'allocations', foreignKey: 'customerPaymentId' });
CustomerPaymentAllocation.belongsTo(CustomerPayment, { as: 'payment', foreignKey: 'customerPaymentId' });
CustomerPaymentAllocation.belongsTo(Sale, { as: 'sale', foreignKey: 'saleId' });
CustomerPaymentAllocation.belongsTo(SalePayment, { as: 'salePayment', foreignKey: 'salePaymentId' });
Sale.hasMany(CustomerPaymentAllocation, { as: 'paymentAllocations', foreignKey: 'saleId' });

// Banking & Payments - Expenses and (outgoing) Payments
Expense.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Expense.belongsTo(User, { as: 'decider', foreignKey: 'decidedBy' });
Expense.belongsTo(User, { as: 'voider', foreignKey: 'voidedBy' });
Expense.hasMany(Payment, { as: 'payments', foreignKey: 'expenseId' });
Payment.belongsTo(Expense, { as: 'expense', foreignKey: 'expenseId' });
Payment.belongsTo(BankAccount, { as: 'bankAccount', foreignKey: 'bankAccountId' });
Payment.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Payment.belongsTo(User, { as: 'voider', foreignKey: 'voidedBy' });
Payment.hasMany(BankTransaction, { as: 'bankTransactions', foreignKey: 'paymentId' });
BankTransaction.belongsTo(Payment, { as: 'payment', foreignKey: 'paymentId' });

// Phase 6 - Fuel associations
Driver.belongsTo(Staff, { as: 'staff', foreignKey: 'staffId' });
Driver.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Driver.hasMany(Vehicle, { as: 'vehicles', foreignKey: 'driverId' });
Driver.hasMany(FuelFunding, { as: 'fundings', foreignKey: 'driverId' });
Vehicle.belongsTo(Driver, { as: 'driver', foreignKey: 'driverId' });
Vehicle.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Vehicle.hasMany(FuelFunding, { as: 'fundings', foreignKey: 'vehicleId' });
FuelFunding.belongsTo(Vehicle, { as: 'vehicle', foreignKey: 'vehicleId' });
FuelFunding.belongsTo(Driver, { as: 'driver', foreignKey: 'driverId' });
FuelFunding.belongsTo(BankAccount, { as: 'bankAccount', foreignKey: 'bankAccountId' });
FuelFunding.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
FuelFunding.belongsTo(User, { as: 'decider', foreignKey: 'decidedBy' });
FuelFunding.belongsTo(User, { as: 'voider', foreignKey: 'voidedBy' });
FuelFunding.hasMany(BankTransaction, { as: 'bankTransactions', foreignKey: 'fuelFundingId' });
BankTransaction.belongsTo(FuelFunding, { as: 'fuelFunding', foreignKey: 'fuelFundingId' });

// Phase 6b - Fuel usage associations
FuelUsage.belongsTo(FuelFunding, { as: 'funding', foreignKey: 'fuelFundingId' });
FuelUsage.belongsTo(Vehicle, { as: 'vehicle', foreignKey: 'vehicleId' });
FuelUsage.belongsTo(Driver, { as: 'driver', foreignKey: 'driverId' });
FuelUsage.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
FuelUsage.belongsTo(User, { as: 'voider', foreignKey: 'voidedBy' });
FuelFunding.hasMany(FuelUsage, { as: 'usages', foreignKey: 'fuelFundingId' });
Vehicle.hasMany(FuelUsage, { as: 'fuelUsages', foreignKey: 'vehicleId' });
Driver.hasMany(FuelUsage, { as: 'fuelUsages', foreignKey: 'driverId' });

// Phase 7 - EFD: Z reports, daily reconciliation
EfdZReport.belongsTo(EfdDevice, { as: 'device', foreignKey: 'deviceId' });
EfdDevice.hasMany(EfdZReport, { as: 'zReports', foreignKey: 'deviceId' });
EfdZReport.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
EfdZReport.belongsTo(User, { as: 'decider', foreignKey: 'decidedBy' });
EfdZReport.belongsTo(User, { as: 'voider', foreignKey: 'voidedBy' });
EfdReconciliation.belongsTo(EfdDevice, { as: 'device', foreignKey: 'deviceId' });
EfdDevice.hasMany(EfdReconciliation, { as: 'reconciliations', foreignKey: 'deviceId' });
EfdReconciliation.belongsTo(EfdZReport, { as: 'zReport', foreignKey: 'zReportId' });
EfdZReport.hasMany(EfdReconciliation, { as: 'reconciliations', foreignKey: 'zReportId' });
EfdReconciliation.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
EfdReconciliation.belongsTo(User, { as: 'reconciler', foreignKey: 'reconciledBy' });
EfdReconciliation.belongsTo(User, { as: 'voider', foreignKey: 'voidedBy' });

// Warehouses
Warehouse.belongsToMany(User, { as: 'storekeepers', through: WarehouseStorekeeper, foreignKey: 'warehouseId', otherKey: 'userId' });
User.belongsToMany(Warehouse, { as: 'warehouses', through: WarehouseStorekeeper, foreignKey: 'userId', otherKey: 'warehouseId' });
Warehouse.hasMany(WarehouseStock, { as: 'stock', foreignKey: 'warehouseId' });
WarehouseStock.belongsTo(Warehouse, { as: 'warehouse', foreignKey: 'warehouseId' });
WarehouseStock.belongsTo(Item, { as: 'item', foreignKey: 'itemId' });
StockDocument.belongsTo(Warehouse, { as: 'warehouse', foreignKey: 'warehouseId' });
Salesperson.belongsTo(Warehouse, { as: 'warehouse', foreignKey: 'warehouseId' });
Warehouse.hasMany(Salesperson, { as: 'salespersons', foreignKey: 'warehouseId' });
WarehouseTransfer.belongsTo(Warehouse, { as: 'fromWarehouse', foreignKey: 'fromWarehouseId' });
WarehouseTransfer.belongsTo(Warehouse, { as: 'toWarehouse', foreignKey: 'toWarehouseId' });
WarehouseTransfer.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
WarehouseTransfer.belongsTo(ApprovalRequest, { as: 'approval', foreignKey: 'approvalId' });
WarehouseTransfer.hasMany(WarehouseTransferLine, { as: 'lines', foreignKey: 'transferId' });
WarehouseTransferLine.belongsTo(WarehouseTransfer, { as: 'transfer', foreignKey: 'transferId' });
WarehouseTransferLine.belongsTo(Item, { as: 'item', foreignKey: 'itemId' });
WarehouseTransferLine.belongsTo(StockBatch, { as: 'batch', foreignKey: 'batchId' });

// Physical Count (stock-take)
PhysicalCount.belongsTo(Warehouse, { as: 'warehouse', foreignKey: 'warehouseId' });
PhysicalCount.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
PhysicalCount.belongsTo(User, { as: 'voider', foreignKey: 'voidedBy' });
PhysicalCount.hasMany(PhysicalCountLine, { as: 'lines', foreignKey: 'countId' });
PhysicalCountLine.belongsTo(PhysicalCount, { as: 'count', foreignKey: 'countId' });
PhysicalCountLine.belongsTo(Item, { as: 'item', foreignKey: 'itemId' });

module.exports = {
  sequelize, Sequelize, Role, Permission, RolePermission, User, Session, AuditLog, ApprovalRequest, Notification, Attachment,
  Category, Item, StockLevel, StockBatch, StockDocument, StockDocumentLine, StockMovement,
  Salesperson, Customer, SalesOrder, SalesOrderLine,
  Discount, EfdDevice, EfdReceipt, EfdZReport, EfdReconciliation, Sale, SaleLine, SalePayment, Staff,
  OrderWorkflow, OrderWorkflowEvent,
  Bank, BankAccount, BankTransaction, CustomerPayment, CustomerPaymentAllocation,
  Expense, Payment,
  Driver, Vehicle, FuelFunding, FuelUsage,
  Warehouse, WarehouseStorekeeper, WarehouseStock, WarehouseItemSetting, WarehouseTransfer, WarehouseTransferLine,
  PhysicalCount, PhysicalCountLine,
};
