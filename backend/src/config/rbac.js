// Single definition of permissions and default role grants. Seeded into the DB.
const PERMISSIONS = {
  users: ['read', 'create', 'update', 'deactivate', 'reset_password'],
  roles: ['read', 'manage'],
  audit: ['read', 'verify'],
  approvals: ['read', 'read_all', 'create', 'approve'],
  files: ['upload', 'read'],
  notifications: ['read'],
  monitoring: ['read'],

  // ---- Phase 2: Inventory ----
  categories: ['read', 'create', 'update', 'delete'],
  items: ['read', 'create', 'update', 'deactivate', 'delete', 'view_cost'],
  stock: ['read'],
  receiving: ['read', 'create', 'approve'],      // Stock receiving
  movements: ['read'],                           // Stock movement ledger
  adjustments: ['read', 'create', 'approve'],    // Stock adjustments (+/-)
  reject_in: ['read', 'create', 'approve'],      // Customer returns
  reject_out: ['read', 'create', 'approve'],     // Returns to supplier
  expired: ['read', 'create', 'approve'],        // Expired stock write-off
  damaged: ['read', 'create', 'approve'],        // Damaged stock write-off
  stock_reports: ['read', 'valuation'],          // valuation = anything showing cost / stock value

  // ---- Phase 3: Sales & Customers ----
  customers: ['read', 'read_all', 'create', 'update', 'assign', 'deactivate', 'delete'], // read_all = every customer, not only own
  salespersons: ['read', 'create', 'update', 'deactivate', 'delete', 'view_commission'],
  sales_orders: ['read', 'read_all', 'create', 'set_price', 'approve'],                  // set_price = custom price / discount on a line

  // ---- Phase 3b: Sales register, cash sales, credit sales ----
  sales: ['read', 'summary'],                                                            // read-only register of cash + credit sales
  cash_sales: ['read', 'read_all', 'create', 'set_price', 'void'],
  credit_sales: ['read', 'read_all', 'create', 'set_price', 'approve', 'override_limit', 'receive_payment', 'void', 'void_payment'],

  // ---- Phase 3c: Customer balances, payment history, credit ageing ----
  customer_balances: ['read', 'read_all'],
  payment_history: ['read', 'read_all'],
  credit_ageing: ['read', 'read_all'],

  // ---- Staff ----
  staff: ['read', 'create', 'update', 'deactivate', 'delete'],

  // ---- Phase 3 (part 2): Discounts and EFD numbers ----
  discounts: ['read', 'create', 'update', 'deactivate', 'delete', 'apply'],              // apply = use a ready-made discount on an order line
  efd_devices: ['read', 'create', 'update', 'deactivate', 'delete'],                     // registered fiscal devices
  efd_receipts: ['read', 'read_all', 'create', 'void'],                                  // EFD receipt numbers recorded against confirmed orders

  // ---- Phase 4: Approval workflow (Salesperson -> Storekeeper -> Manager -> Salesperson) ----
  order_workflow: ['read', 'read_all', 'storekeeper_review', 'manager_review', 'acknowledge'],   // read_all = every order, not only own / in my queue
  // ---- Phase 5: Banking & Payments ----
  banks: ['read', 'create', 'update', 'deactivate', 'delete'],
  bank_accounts: ['read', 'create', 'update', 'deactivate', 'delete', 'view_balance'],        // view_balance = see balances and statements
  bank_transactions: ['read', 'create', 'transfer', 'void', 'reconcile'],                     // ledger of money in / out of bank accounts
  customer_payments: ['read', 'read_all', 'create', 'void'],                                  // read_all = every customer, not only own

  // ---- Phase 5b: Expenses, outgoing Payments, Transfers ----
  expenses: ['read', 'read_all', 'create', 'update', 'approve', 'void'],                     // read_all = every expense, not only own; update = edit own PENDING expense
  payments: ['read', 'create', 'void'],                                                      // money paid OUT (settles expenses / pays a payee)
  transfers: ['read', 'create', 'void'],                                                     // moves between our own bank accounts

  // ---- Phase 6: Fuel ----
  drivers: ['read', 'create', 'update', 'deactivate', 'delete'],                             // driver register (licence details)
  vehicles: ['read', 'create', 'update', 'deactivate', 'delete', 'assign'],                  // assign = set or clear a vehicle's default driver
  fuel_funding: ['read', 'read_all', 'create', 'update', 'approve', 'void'],                 // money given to a driver for a vehicle's fuel; read_all = every request, not only own; update = edit own PENDING request

  // ---- Phase 6b: Fuel usage, balances, reports ----
  fuel_usage: ['read', 'read_all', 'create', 'update', 'void'],                              // fuel the driver actually bought; read_all = every record, not only own; update = edit own ACTIVE record
  fuel_balances: ['read', 'read_all'],                                                       // unspent money per funding / vehicle / driver; read_all = every funding, not only own
  fuel_reports: ['read'],                                                                    // consumption, reconciliation and monthly reports (company-wide, so managers only)

  // ---- Phase 7: EFD - Z reports, daily reconciliation, difference detection, EFD reports ----
  efd_z_reports: ['read', 'read_all', 'create', 'update', 'verify', 'void'],                 // the device's end-of-day (Z) report; read_all = every report, not only own; update = edit own PENDING report; verify = verify / reject (never your own)
  efd_reconciliations: ['read', 'read_all', 'create', 'reconcile', 'void'],                  // Z report vs receipts of the day; reconcile = sign off (never your own)
  efd_differences: ['read'],                                                                 // difference detection scan - company-wide fiscal data, so managers only
  efd_reports: ['read', 'export'],                                                           // EFD summaries; export = download as CSV. Company-wide, so managers only

  // ---- Warehouses ----
  warehouses: ['read', 'read_all', 'create', 'update', 'deactivate', 'assign'],              // read_all = every warehouse, not only the ones you are in charge of; assign = choose storekeepers / a salesperson's warehouse
  warehouse_transfers: ['read', 'read_all', 'create', 'approve'],                            // moves of stock between warehouses; create = request one (source-warehouse storekeeper); approve = Manager releases the stock
};
const ALL = Object.entries(PERMISSIONS).flatMap(([m, a]) => a.map((x) => `${m}.${x}`));

// Modules added in Phase 2 (used by the Phase 2 seeder so it never touches Phase 1 grants).
const INVENTORY_MODULES = ['categories', 'items', 'stock', 'receiving', 'movements', 'adjustments',
  'reject_in', 'reject_out', 'expired', 'damaged', 'stock_reports'];
const SALES_MODULES = ['customers', 'salespersons', 'sales_orders'];
const SALES_V2_MODULES = ['sales', 'cash_sales', 'credit_sales'];
const SALES_V3_MODULES = ['customer_balances', 'payment_history', 'credit_ageing'];
const STAFF_MODULES = ['staff'];
const WORKFLOW_MODULES = ['order_workflow'];
const SALES_EXTRA_MODULES = ['discounts', 'efd_devices', 'efd_receipts'];
const BANKING_MODULES = ['banks', 'bank_accounts', 'bank_transactions', 'customer_payments'];
const BANKING_EXTRA_MODULES = ['expenses', 'payments', 'transfers'];
const FUEL_MODULES = ['drivers', 'vehicles', 'fuel_funding'];
const FUEL_USAGE_MODULES = ['fuel_usage', 'fuel_balances', 'fuel_reports'];
const EFD_MODULES = ['efd_z_reports', 'efd_reconciliations', 'efd_differences', 'efd_reports'];
const WAREHOUSE_MODULES = ['warehouses', 'warehouse_transfers'];
const DOC_MODULES = ['receiving', 'adjustments', 'reject_in', 'reject_out', 'expired', 'damaged'];

const common = ['approvals.read', 'approvals.create', 'files.upload', 'files.read', 'notifications.read'];
const invView = ['categories.read', 'items.read', 'stock.read'];
const invStorekeeper = [...invView, 'items.create', 'items.update', 'items.view_cost', 'movements.read', 'stock_reports.read',
  ...DOC_MODULES.flatMap((m) => [`${m}.read`, `${m}.create`])];
const invManager = [...invView, 'categories.create', 'categories.update', 'items.create', 'items.update', 'items.deactivate',
  'items.view_cost', 'movements.read', 'stock_reports.read', 'stock_reports.valuation',
  ...DOC_MODULES.flatMap((m) => [`${m}.read`, `${m}.create`, `${m}.approve`])];

const salesSelf = ['customers.read', 'customers.create', 'customers.update', 'sales_orders.read', 'sales_orders.create'];
const salesManager = ['customers.read', 'customers.read_all', 'customers.create', 'customers.update', 'customers.assign', 'customers.deactivate',
  'salespersons.read', 'salespersons.create', 'salespersons.update', 'salespersons.deactivate', 'salespersons.view_commission',
  'sales_orders.read', 'sales_orders.read_all', 'sales_orders.create', 'sales_orders.set_price', 'sales_orders.approve'];

const salesV2Self = ['sales.read', 'cash_sales.read', 'cash_sales.create', 'credit_sales.read', 'credit_sales.create',
  'customer_balances.read', 'payment_history.read', 'credit_ageing.read'];
const salesV2Manager = ['sales.read', 'sales.summary',
  'cash_sales.read', 'cash_sales.read_all', 'cash_sales.create', 'cash_sales.set_price', 'cash_sales.void',
  'credit_sales.read', 'credit_sales.read_all', 'credit_sales.create', 'credit_sales.set_price', 'credit_sales.approve', 'credit_sales.receive_payment', 'credit_sales.void',
  'customer_balances.read', 'customer_balances.read_all', 'payment_history.read', 'payment_history.read_all', 'credit_ageing.read', 'credit_ageing.read_all'];

const salesExtraSelf = ['discounts.apply', 'efd_receipts.read'];
const salesExtraManager = ['discounts.read', 'discounts.create', 'discounts.update', 'discounts.deactivate', 'discounts.apply',
  'efd_devices.read', 'efd_devices.create', 'efd_devices.update', 'efd_devices.deactivate',
  'efd_receipts.read', 'efd_receipts.read_all', 'efd_receipts.create', 'efd_receipts.void'];

const workflowSelf = ['order_workflow.read', 'order_workflow.acknowledge'];
const workflowStorekeeper = ['order_workflow.read', 'order_workflow.storekeeper_review'];
const workflowManager = ['order_workflow.read', 'order_workflow.read_all', 'order_workflow.manager_review'];

const bankingSelf = ['customer_payments.read', 'expenses.read', 'expenses.create', 'expenses.update'];   // staff can submit and track their own expenses
const bankingManager = ['banks.read', 'banks.create', 'banks.update', 'banks.deactivate',
  'bank_accounts.read', 'bank_accounts.create', 'bank_accounts.update', 'bank_accounts.deactivate', 'bank_accounts.view_balance',
  'bank_transactions.read', 'bank_transactions.create', 'bank_transactions.transfer', 'bank_transactions.void', 'bank_transactions.reconcile',
  'customer_payments.read', 'customer_payments.read_all', 'customer_payments.create', 'customer_payments.void',
  'expenses.read', 'expenses.read_all', 'expenses.create', 'expenses.update', 'expenses.approve', 'expenses.void',
  'payments.read', 'payments.create', 'payments.void', 'transfers.read', 'transfers.create', 'transfers.void'];

// Fuel: a storekeeper can look up vehicles / drivers and raise + track their own fuel funding requests; a manager runs the whole module (delete stays Owner-only).
const fuelSelf = ['drivers.read', 'vehicles.read', 'fuel_funding.read', 'fuel_funding.create', 'fuel_funding.update'];
const fuelManager = ['drivers.read', 'drivers.create', 'drivers.update', 'drivers.deactivate',
  'vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.deactivate', 'vehicles.assign',
  'fuel_funding.read', 'fuel_funding.read_all', 'fuel_funding.create', 'fuel_funding.update', 'fuel_funding.approve', 'fuel_funding.void'];

// Fuel usage / balances / reports: a storekeeper records and tracks usage on the fundings they raised; a manager sees everything, can void usage and runs the reports.
const fuelUsageSelf = ['fuel_usage.read', 'fuel_usage.create', 'fuel_usage.update', 'fuel_balances.read'];
const fuelUsageManager = ['fuel_usage.read', 'fuel_usage.read_all', 'fuel_usage.create', 'fuel_usage.update', 'fuel_usage.void',
  'fuel_balances.read', 'fuel_balances.read_all', 'fuel_reports.read'];

// EFD (Z reports, reconciliation, difference detection, reports) is fiscal and company-wide: managers run it, nobody else gets it by default (grant it per role in the Roles screen).
// Verify / reconcile are still blocked on your own work by the services, even for a manager.
const efdManager = ['efd_z_reports.read', 'efd_z_reports.read_all', 'efd_z_reports.create', 'efd_z_reports.update', 'efd_z_reports.verify', 'efd_z_reports.void',
  'efd_reconciliations.read', 'efd_reconciliations.read_all', 'efd_reconciliations.create', 'efd_reconciliations.reconcile', 'efd_reconciliations.void',
  'efd_differences.read', 'efd_reports.read', 'efd_reports.export'];

// Warehouses: a storekeeper sees the warehouses they are in charge of and requests transfers out of them; a manager sees everything, creates warehouses,
// assigns storekeepers / salespersons and approves transfers. (A manager cannot approve a transfer they requested themselves.)
const warehouseStorekeeper = ['warehouses.read', 'warehouse_transfers.read', 'warehouse_transfers.create'];
const warehouseManager = ['warehouses.read', 'warehouses.read_all', 'warehouses.create', 'warehouses.update', 'warehouses.deactivate', 'warehouses.assign',
  'warehouse_transfers.read', 'warehouse_transfers.read_all', 'warehouse_transfers.create', 'warehouse_transfers.approve'];

const ROLES = {
  OWNER: { name: 'Owner', level: 100, description: 'Full executive access', permissions: ALL },
  MANAGER: { name: 'Manager', level: 70, description: 'Reviews and approves; limited admin',
    permissions: [...common, 'approvals.read_all', 'approvals.approve', 'users.read', 'roles.read', ...invManager, ...salesManager, ...salesV2Manager, ...salesExtraManager, ...workflowManager, ...bankingManager, ...fuelManager, ...fuelUsageManager, ...efdManager, ...warehouseManager] },
  STOREKEEPER: { name: 'Storekeeper', level: 40, description: 'Warehouse and stock control', permissions: [...common, ...invStorekeeper, ...workflowStorekeeper, ...bankingSelf.filter((p) => p.startsWith('expenses.')), ...fuelSelf, ...fuelUsageSelf, ...warehouseStorekeeper] },
  SALESPERSON: { name: 'Sales Person', level: 30, description: 'Own customers, orders and sales', permissions: [...common, ...invView, ...salesSelf, ...salesV2Self, ...salesExtraSelf, ...workflowSelf, ...bankingSelf] },
};
module.exports = { PERMISSIONS, ALL, ROLES, INVENTORY_MODULES, SALES_MODULES, SALES_V2_MODULES, SALES_V3_MODULES, SALES_EXTRA_MODULES, STAFF_MODULES, DOC_MODULES, WORKFLOW_MODULES, BANKING_MODULES, BANKING_EXTRA_MODULES, FUEL_MODULES, FUEL_USAGE_MODULES, EFD_MODULES, WAREHOUSE_MODULES };
