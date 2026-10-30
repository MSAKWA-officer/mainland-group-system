import { SALES_ORDERS, DISCOUNTS } from './config/features.js';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Shell from './components/Shell.jsx';
import Guard from './components/Guard.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ApprovalsList from './features/approvals/ApprovalsList.jsx';
import ApprovalsCreate from './features/approvals/ApprovalsCreate.jsx';
import ApprovalsUpdate from './features/approvals/ApprovalsUpdate.jsx';
import ApprovalsView from './features/approvals/ApprovalsView.jsx';
import CategoriesList from './features/categories/CategoriesList.jsx';
import CategoriesCreate from './features/categories/CategoriesCreate.jsx';
import CategoriesUpdate from './features/categories/CategoriesUpdate.jsx';
import CategoriesView from './features/categories/CategoriesView.jsx';
import ItemsList from './features/items/ItemsList.jsx';
import ItemsCreate from './features/items/ItemsCreate.jsx';
import ItemsUpdate from './features/items/ItemsUpdate.jsx';
import ItemsView from './features/items/ItemsView.jsx';
import StockList from './features/stock/StockList.jsx';
import StockCreate from './features/stock/StockCreate.jsx';
import StockUpdate from './features/stock/StockUpdate.jsx';
import StockView from './features/stock/StockView.jsx';
import ReceivingList from './features/receiving/ReceivingList.jsx';
import ReceivingCreate from './features/receiving/ReceivingCreate.jsx';
import ReceivingUpdate from './features/receiving/ReceivingUpdate.jsx';
import ReceivingView from './features/receiving/ReceivingView.jsx';
import MovementsList from './features/movements/MovementsList.jsx';
import MovementsView from './features/movements/MovementsView.jsx';
import AdjustmentsList from './features/adjustments/AdjustmentsList.jsx';
import AdjustmentsCreate from './features/adjustments/AdjustmentsCreate.jsx';
import AdjustmentsUpdate from './features/adjustments/AdjustmentsUpdate.jsx';
import AdjustmentsView from './features/adjustments/AdjustmentsView.jsx';
import RejectInList from './features/reject-in/RejectInList.jsx';
import RejectInCreate from './features/reject-in/RejectInCreate.jsx';
import RejectInUpdate from './features/reject-in/RejectInUpdate.jsx';
import RejectInView from './features/reject-in/RejectInView.jsx';
import RejectOutList from './features/reject-out/RejectOutList.jsx';
import RejectOutCreate from './features/reject-out/RejectOutCreate.jsx';
import RejectOutUpdate from './features/reject-out/RejectOutUpdate.jsx';
import RejectOutView from './features/reject-out/RejectOutView.jsx';
import ExpiredList from './features/expired/ExpiredList.jsx';
import ExpiredCreate from './features/expired/ExpiredCreate.jsx';
import ExpiredUpdate from './features/expired/ExpiredUpdate.jsx';
import ExpiredView from './features/expired/ExpiredView.jsx';
import DamagedList from './features/damaged/DamagedList.jsx';
import DamagedCreate from './features/damaged/DamagedCreate.jsx';
import DamagedUpdate from './features/damaged/DamagedUpdate.jsx';
import DamagedView from './features/damaged/DamagedView.jsx';
import ReportsList from './features/reports/ReportsList.jsx';
import ReportsView from './features/reports/ReportsView.jsx';
import WarehouseStatement from './features/reports/WarehouseStatement.jsx';
import CustomersList from './features/customers/CustomersList.jsx';
import CustomersCreate from './features/customers/CustomersCreate.jsx';
import CustomersUpdate from './features/customers/CustomersUpdate.jsx';
import CustomersView from './features/customers/CustomersView.jsx';
import SalesOrdersList from './features/salesOrders/SalesOrdersList.jsx';
import SalesOrdersCreate from './features/salesOrders/SalesOrdersCreate.jsx';
import SalesOrdersUpdate from './features/salesOrders/SalesOrdersUpdate.jsx';
import SalesOrdersView from './features/salesOrders/SalesOrdersView.jsx';
import CreditSalesList from './features/creditSales/CreditSalesList.jsx';
import CreditSalesCreate from './features/creditSales/CreditSalesCreate.jsx';
import CreditSalesUpdate from './features/creditSales/CreditSalesUpdate.jsx';
import CreditSalesView from './features/creditSales/CreditSalesView.jsx';
import ReceivablesList from './features/creditSales/ReceivablesList.jsx';
import CustomerBalancesList from './features/customerBalances/CustomerBalancesList.jsx';
import CustomerBalancesView from './features/customerBalances/CustomerBalancesView.jsx';
import PaymentHistoryList from './features/paymentHistory/PaymentHistoryList.jsx';
import PaymentHistoryView from './features/paymentHistory/PaymentHistoryView.jsx';
import CreditAgeingList from './features/creditAgeing/CreditAgeingList.jsx';
import CreditAgeingView from './features/creditAgeing/CreditAgeingView.jsx';
import CashSalesList from './features/cashSales/CashSalesList.jsx';
import CashSalesCreate from './features/cashSales/CashSalesCreate.jsx';
import CashSalesView from './features/cashSales/CashSalesView.jsx';
import DiscountsList from './features/discounts/DiscountsList.jsx';
import DiscountsView from './features/discounts/DiscountsView.jsx';
import DiscountForm from './features/discounts/DiscountForm.jsx';
import SalesReportsPage from './features/salesReports/SalesReportsPage.jsx';
import EfdReceiptsList from './features/efdReceipts/EfdReceiptsList.jsx';
import EfdReceiptsCreate from './features/efdReceipts/EfdReceiptsCreate.jsx';
import EfdReceiptsView from './features/efdReceipts/EfdReceiptsView.jsx';
import EfdZReportsList from './features/efdZReports/EfdZReportsList.jsx';
import EfdZReportsCreate from './features/efdZReports/EfdZReportsCreate.jsx';
import EfdZReportsUpdate from './features/efdZReports/EfdZReportsUpdate.jsx';
import EfdZReportsView from './features/efdZReports/EfdZReportsView.jsx';
import EfdReconciliationsList from './features/efdReconciliations/EfdReconciliationsList.jsx';
import EfdReconciliationsCreate from './features/efdReconciliations/EfdReconciliationsCreate.jsx';
import EfdReconciliationsView from './features/efdReconciliations/EfdReconciliationsView.jsx';
import EfdDifferencesList from './features/efdDifferences/EfdDifferencesList.jsx';
import EfdDifferencesView from './features/efdDifferences/EfdDifferencesView.jsx';
import EfdReportsList from './features/efdReports/EfdReportsList.jsx';
import EfdDevicesList from './features/efdDevices/EfdDevicesList.jsx';
import EfdDevicesView from './features/efdDevices/EfdDevicesView.jsx';
import EfdDevicesUpdate from './features/efdDevices/EfdDevicesUpdate.jsx';
import EfdDeviceForm from './features/efdDevices/EfdDeviceForm.jsx';
import BanksList from './features/banks/BanksList.jsx';
import BanksView from './features/banks/BanksView.jsx';
import BankForm from './features/banks/BankForm.jsx';
import BankAccountsList from './features/bankAccounts/BankAccountsList.jsx';
import BankAccountsView from './features/bankAccounts/BankAccountsView.jsx';
import BankAccountForm from './features/bankAccounts/BankAccountForm.jsx';
import BankTransactionsList from './features/bankTransactions/BankTransactionsList.jsx';
import BankTransactionsCreate from './features/bankTransactions/BankTransactionsCreate.jsx';
import BankTransactionsTransfer from './features/bankTransactions/BankTransactionsTransfer.jsx';
import BankTransactionsView from './features/bankTransactions/BankTransactionsView.jsx';
import CustomerPaymentsList from './features/customerPayments/CustomerPaymentsList.jsx';
import CustomerPaymentsCreate from './features/customerPayments/CustomerPaymentsCreate.jsx';
import CustomerPaymentsView from './features/customerPayments/CustomerPaymentsView.jsx';
import ExpensesList from './features/expenses/ExpensesList.jsx';
import ExpensesCreate from './features/expenses/ExpensesCreate.jsx';
import ExpensesUpdate from './features/expenses/ExpensesUpdate.jsx';
import ExpensesView from './features/expenses/ExpensesView.jsx';
import PaymentsList from './features/payments/PaymentsList.jsx';
import PaymentsCreate from './features/payments/PaymentsCreate.jsx';
import PaymentsView from './features/payments/PaymentsView.jsx';
import TransfersList from './features/transfers/TransfersList.jsx';
import TransfersCreate from './features/transfers/TransfersCreate.jsx';
import TransfersView from './features/transfers/TransfersView.jsx';
import DriversList from './features/drivers/DriversList.jsx';
import DriversCreate from './features/drivers/DriversCreate.jsx';
import DriversUpdate from './features/drivers/DriversUpdate.jsx';
import DriversView from './features/drivers/DriversView.jsx';
import VehiclesList from './features/vehicles/VehiclesList.jsx';
import VehiclesCreate from './features/vehicles/VehiclesCreate.jsx';
import VehiclesUpdate from './features/vehicles/VehiclesUpdate.jsx';
import VehiclesView from './features/vehicles/VehiclesView.jsx';
import FuelFundingList from './features/fuelFunding/FuelFundingList.jsx';
import FuelFundingCreate from './features/fuelFunding/FuelFundingCreate.jsx';
import FuelFundingUpdate from './features/fuelFunding/FuelFundingUpdate.jsx';
import FuelFundingView from './features/fuelFunding/FuelFundingView.jsx';
import FuelUsageList from './features/fuelUsage/FuelUsageList.jsx';
import FuelUsageCreate from './features/fuelUsage/FuelUsageCreate.jsx';
import FuelUsageUpdate from './features/fuelUsage/FuelUsageUpdate.jsx';
import FuelUsageView from './features/fuelUsage/FuelUsageView.jsx';
import FuelBalancesList from './features/fuelBalances/FuelBalancesList.jsx';
import FuelBalancesView from './features/fuelBalances/FuelBalancesView.jsx';
import FuelReportsList from './features/fuelReports/FuelReportsList.jsx';
import FuelReportsCreate from './features/fuelReports/FuelReportsCreate.jsx';
import FuelReportsUpdate from './features/fuelReports/FuelReportsUpdate.jsx';
import FuelReportsView from './features/fuelReports/FuelReportsView.jsx';
import ReconciliationPage from './features/reconciliation/ReconciliationPage.jsx';
import OrderWorkflowList from './features/orderWorkflow/OrderWorkflowList.jsx';
import OrderWorkflowView from './features/orderWorkflow/OrderWorkflowView.jsx';
import SalesList from './features/sales/SalesList.jsx';
import SalesView from './features/sales/SalesView.jsx';
import SalespersonsList from './features/salespersons/SalespersonsList.jsx';
import SalespersonsCreate from './features/salespersons/SalespersonsCreate.jsx';
import SalespersonsUpdate from './features/salespersons/SalespersonsUpdate.jsx';
import SalespersonsView from './features/salespersons/SalespersonsView.jsx';
import StaffList from './features/staff/StaffList.jsx';
import StaffForm from './features/staff/StaffForm.jsx';
import WarehousesList from './features/warehouses/WarehousesList.jsx';
import WarehouseForm from './features/warehouses/WarehouseForm.jsx';
import WarehousesView from './features/warehouses/WarehousesView.jsx';
import WarehouseTransfersList from './features/warehouseTransfers/WarehouseTransfersList.jsx';
import WarehouseTransfersCreate from './features/warehouseTransfers/WarehouseTransfersCreate.jsx';
import WarehouseTransfersView from './features/warehouseTransfers/WarehouseTransfersView.jsx';
import PhysicalCountsList from './features/physicalCounts/PhysicalCountsList.jsx';
import PhysicalCountsCreate from './features/physicalCounts/PhysicalCountsCreate.jsx';
import PhysicalCountsView from './features/physicalCounts/PhysicalCountsView.jsx';
import UserList from './features/users/UserList.jsx';
import UserCreate from './features/users/UserCreate.jsx';
import UserUpdate from './features/users/UserUpdate.jsx';
import UserView from './features/users/UserView.jsx';
import RolesPage from './pages/RolesPage.jsx';
import AuditPage from './pages/AuditPage.jsx';

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (!user) return <Routes><Route path="*" element={<LoginPage />} /></Routes>;
  if (user.mustChangePassword) return <ChangePasswordPage forced />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/approvals" element={<Guard perm="approvals.read"><ApprovalsList /></Guard>} />
        <Route path="/approvals/new" element={<Guard perm="approvals.create"><ApprovalsCreate /></Guard>} />
        <Route path="/approvals/:id" element={<Guard perm="approvals.read"><ApprovalsView /></Guard>} />
        <Route path="/approvals/:id/edit" element={<Guard perm="approvals.create"><ApprovalsUpdate /></Guard>} />
        <Route path="/categories" element={<Guard perm="categories.read"><CategoriesList /></Guard>} />
        <Route path="/categories/new" element={<Guard perm="categories.create"><CategoriesCreate /></Guard>} />
        <Route path="/categories/:id" element={<Guard perm="categories.read"><CategoriesView /></Guard>} />
        <Route path="/categories/:id/edit" element={<Guard perm="categories.update"><CategoriesUpdate /></Guard>} />
        <Route path="/items" element={<Guard perm="items.read"><ItemsList /></Guard>} />
        <Route path="/items/new" element={<Guard perm="items.create"><ItemsCreate /></Guard>} />
        <Route path="/items/:id" element={<Guard perm="items.read"><ItemsView /></Guard>} />
        <Route path="/items/:id/edit" element={<Guard perm="items.update"><ItemsUpdate /></Guard>} />
        <Route path="/stock" element={<Guard perm="stock.read"><StockList /></Guard>} />
        <Route path="/stock/new" element={<Guard perm="adjustments.create"><StockCreate /></Guard>} />
        <Route path="/stock/:id" element={<Guard perm="adjustments.read"><StockView /></Guard>} />
        <Route path="/stock/:id/edit" element={<Guard perm="adjustments.create"><StockUpdate /></Guard>} />
        <Route path="/receiving" element={<Guard perm="receiving.read"><ReceivingList /></Guard>} />
        <Route path="/receiving/new" element={<Guard perm="receiving.create"><ReceivingCreate /></Guard>} />
        <Route path="/receiving/:id" element={<Guard perm="receiving.read"><ReceivingView /></Guard>} />
        <Route path="/receiving/:id/edit" element={<Guard perm="receiving.create"><ReceivingUpdate /></Guard>} />
        <Route path="/warehouses" element={<Guard perm="warehouses.read"><WarehousesList /></Guard>} />
        <Route path="/warehouses/new" element={<Guard perm="warehouses.create"><WarehouseForm /></Guard>} />
        <Route path="/warehouses/:id" element={<Guard perm="warehouses.read"><WarehousesView /></Guard>} />
        <Route path="/warehouses/:id/edit" element={<Guard perm="warehouses.update"><WarehouseForm /></Guard>} />
        <Route path="/warehouse-transfers" element={<Guard perm="warehouse_transfers.read"><WarehouseTransfersList /></Guard>} />
        <Route path="/warehouse-transfers/new" element={<Guard perm="warehouse_transfers.create"><WarehouseTransfersCreate /></Guard>} />
        <Route path="/warehouse-transfers/:id" element={<Guard perm="warehouse_transfers.read"><WarehouseTransfersView /></Guard>} />
        <Route path="/physical-counts" element={<Guard perm="physical_counts.read"><PhysicalCountsList /></Guard>} />
        <Route path="/physical-counts/new" element={<Guard perm="physical_counts.create"><PhysicalCountsCreate /></Guard>} />
        <Route path="/physical-counts/:id/edit" element={<Guard perm="physical_counts.void"><PhysicalCountsCreate /></Guard>} />
        <Route path="/physical-counts/:id" element={<Guard perm="physical_counts.read"><PhysicalCountsView /></Guard>} />
        <Route path="/movements" element={<Guard perm="movements.read"><MovementsList /></Guard>} />
        <Route path="/movements/:id" element={<Guard perm="movements.read"><MovementsView /></Guard>} />
        <Route path="/adjustments" element={<Guard perm="adjustments.read"><AdjustmentsList /></Guard>} />
        <Route path="/adjustments/new" element={<Guard perm="adjustments.create"><AdjustmentsCreate /></Guard>} />
        <Route path="/adjustments/:id" element={<Guard perm="adjustments.read"><AdjustmentsView /></Guard>} />
        <Route path="/adjustments/:id/edit" element={<Guard perm="adjustments.create"><AdjustmentsUpdate /></Guard>} />
        <Route path="/reject-in" element={<Guard perm="reject_in.read"><RejectInList /></Guard>} />
        <Route path="/reject-in/new" element={<Guard perm="reject_in.create"><RejectInCreate /></Guard>} />
        <Route path="/reject-in/:id" element={<Guard perm="reject_in.read"><RejectInView /></Guard>} />
        <Route path="/reject-in/:id/edit" element={<Guard perm="reject_in.create"><RejectInUpdate /></Guard>} />
        <Route path="/reject-out" element={<Guard perm="reject_out.read"><RejectOutList /></Guard>} />
        <Route path="/reject-out/new" element={<Guard perm="reject_out.create"><RejectOutCreate /></Guard>} />
        <Route path="/reject-out/:id" element={<Guard perm="reject_out.read"><RejectOutView /></Guard>} />
        <Route path="/reject-out/:id/edit" element={<Guard perm="reject_out.create"><RejectOutUpdate /></Guard>} />
        <Route path="/expired" element={<Guard perm="expired.read"><ExpiredList /></Guard>} />
        <Route path="/expired/new" element={<Guard perm="expired.create"><ExpiredCreate /></Guard>} />
        <Route path="/expired/:id" element={<Guard perm="expired.read"><ExpiredView /></Guard>} />
        <Route path="/expired/:id/edit" element={<Guard perm="expired.create"><ExpiredUpdate /></Guard>} />
        <Route path="/damaged" element={<Guard perm="damaged.read"><DamagedList /></Guard>} />
        <Route path="/damaged/new" element={<Guard perm="damaged.create"><DamagedCreate /></Guard>} />
        <Route path="/damaged/:id" element={<Guard perm="damaged.read"><DamagedView /></Guard>} />
        <Route path="/damaged/:id/edit" element={<Guard perm="damaged.create"><DamagedUpdate /></Guard>} />
        <Route path="/customers" element={<Guard perm="customers.read"><CustomersList /></Guard>} />
        <Route path="/customers/new" element={<Guard perm="customers.create"><CustomersCreate /></Guard>} />
        <Route path="/customers/:id" element={<Guard perm="customers.read"><CustomersView /></Guard>} />
        <Route path="/customers/:id/edit" element={<Guard perm="customers.update"><CustomersUpdate /></Guard>} />
        {SALES_ORDERS && <>   {/* hidden for now: set VITE_ENABLE_SALES_ORDERS=true to bring back */}
        <Route path="/sales-orders" element={<Guard perm="sales_orders.read"><SalesOrdersList /></Guard>} />
        <Route path="/sales-orders/new" element={<Guard perm="sales_orders.create"><SalesOrdersCreate /></Guard>} />
        <Route path="/sales-orders/:id" element={<Guard perm="sales_orders.read"><SalesOrdersView /></Guard>} />
        <Route path="/sales-orders/:id/edit" element={<Guard perm="sales_orders.create"><SalesOrdersUpdate /></Guard>} />
        <Route path="/order-workflow" element={<Guard perm="order_workflow.read"><OrderWorkflowList /></Guard>} />
        <Route path="/order-workflow/:id" element={<Guard perm="order_workflow.read"><OrderWorkflowView /></Guard>} />
        </>}
        <Route path="/credit-sales" element={<Guard perm="credit_sales.read"><CreditSalesList /></Guard>} />
        <Route path="/credit-sales/new" element={<Guard perm="credit_sales.create"><CreditSalesCreate /></Guard>} />
        <Route path="/credit-sales/receivables" element={<Guard perm="credit_sales.read"><ReceivablesList /></Guard>} />
        <Route path="/customer-balances" element={<Guard perm="customer_balances.read"><CustomerBalancesList /></Guard>} />
        <Route path="/customer-balances/:customerId" element={<Guard perm="customer_balances.read"><CustomerBalancesView /></Guard>} />
        <Route path="/payment-history" element={<Guard perm="payment_history.read"><PaymentHistoryList /></Guard>} />
        <Route path="/payment-history/:id" element={<Guard perm="payment_history.read"><PaymentHistoryView /></Guard>} />
        <Route path="/credit-ageing" element={<Guard perm="credit_ageing.read"><CreditAgeingList /></Guard>} />
        <Route path="/credit-ageing/:customerId" element={<Guard perm="credit_ageing.read"><CreditAgeingView /></Guard>} />
        <Route path="/credit-sales/:id" element={<Guard perm="credit_sales.read"><CreditSalesView /></Guard>} />
        <Route path="/credit-sales/:id/edit" element={<Guard perm="credit_sales.create"><CreditSalesUpdate /></Guard>} />
        <Route path="/cash-sales" element={<Guard perm="cash_sales.read"><CashSalesList /></Guard>} />
        <Route path="/cash-sales/new" element={<Guard perm="cash_sales.create"><CashSalesCreate /></Guard>} />
        <Route path="/cash-sales/:id/edit" element={<Guard perm="cash_sales.void"><CashSalesCreate /></Guard>} />
        <Route path="/cash-sales/:id" element={<Guard perm="cash_sales.read"><CashSalesView /></Guard>} />
        <Route path="/sales-reports" element={<Guard perm="sales_reports.read"><SalesReportsPage /></Guard>} />
        {DISCOUNTS && <>   {/* hidden for now: set VITE_ENABLE_DISCOUNTS=true to bring back */}
        <Route path="/discounts" element={<Guard perm="discounts.read"><DiscountsList /></Guard>} />
        <Route path="/discounts/new" element={<Guard perm="discounts.create"><DiscountForm /></Guard>} />
        <Route path="/discounts/:id" element={<Guard perm="discounts.read"><DiscountsView /></Guard>} />
        <Route path="/discounts/:id/edit" element={<Guard perm="discounts.update"><DiscountForm /></Guard>} />
        </>}
        <Route path="/efd-receipts" element={<Guard perm="efd_receipts.read"><EfdReceiptsList /></Guard>} />
        <Route path="/efd-receipts/new" element={<Guard perm="efd_receipts.create"><EfdReceiptsCreate /></Guard>} />
        <Route path="/efd-receipts/:id" element={<Guard perm="efd_receipts.read"><EfdReceiptsView /></Guard>} />
        <Route path="/efd-z-reports" element={<Guard perm="efd_z_reports.read"><EfdZReportsList /></Guard>} />
        <Route path="/efd-z-reports/new" element={<Guard perm="efd_z_reports.create"><EfdZReportsCreate /></Guard>} />
        <Route path="/efd-z-reports/:id" element={<Guard perm="efd_z_reports.read"><EfdZReportsView /></Guard>} />
        <Route path="/efd-z-reports/:id/edit" element={<Guard perm="efd_z_reports.update"><EfdZReportsUpdate /></Guard>} />
        <Route path="/efd-reconciliations" element={<Guard perm="efd_reconciliations.read"><EfdReconciliationsList /></Guard>} />
        <Route path="/efd-reconciliations/new" element={<Guard perm="efd_reconciliations.create"><EfdReconciliationsCreate /></Guard>} />
        <Route path="/efd-reconciliations/:id" element={<Guard perm="efd_reconciliations.read"><EfdReconciliationsView /></Guard>} />
        <Route path="/efd-differences" element={<Guard perm="efd_differences.read"><EfdDifferencesList /></Guard>} />
        <Route path="/efd-differences/view" element={<Guard perm="efd_differences.read"><EfdDifferencesView /></Guard>} />
        <Route path="/efd-reports" element={<Guard perm="efd_reports.read"><EfdReportsList /></Guard>} />
        <Route path="/efd-devices" element={<Guard perm="efd_devices.read"><EfdDevicesList /></Guard>} />
        <Route path="/efd-devices/new" element={<Guard perm="efd_devices.create"><EfdDeviceForm /></Guard>} />
        <Route path="/efd-devices/:id" element={<Guard perm="efd_devices.read"><EfdDevicesView /></Guard>} />
        <Route path="/efd-devices/:id/edit" element={<Guard perm="efd_devices.update"><EfdDeviceForm /></Guard>} />
        <Route path="/banks" element={<Guard perm="banks.read"><BanksList /></Guard>} />
        <Route path="/banks/new" element={<Guard perm="banks.create"><BankForm /></Guard>} />
        <Route path="/banks/:id" element={<Guard perm="banks.read"><BanksView /></Guard>} />
        <Route path="/banks/:id/edit" element={<Guard perm="banks.update"><BankForm /></Guard>} />
        <Route path="/bank-accounts" element={<Guard perm="bank_accounts.read"><BankAccountsList /></Guard>} />
        <Route path="/bank-accounts/new" element={<Guard perm="bank_accounts.create"><BankAccountForm /></Guard>} />
        <Route path="/bank-accounts/:id" element={<Guard perm="bank_accounts.read"><BankAccountsView /></Guard>} />
        <Route path="/bank-accounts/:id/edit" element={<Guard perm="bank_accounts.update"><BankAccountForm /></Guard>} />
        <Route path="/bank-transactions" element={<Guard perm="bank_transactions.read"><BankTransactionsList /></Guard>} />
        <Route path="/bank-transactions/new" element={<Guard perm="bank_transactions.create"><BankTransactionsCreate /></Guard>} />
        <Route path="/bank-transactions/transfer" element={<Guard perm="bank_transactions.transfer"><BankTransactionsTransfer /></Guard>} />
        <Route path="/bank-transactions/:id" element={<Guard perm="bank_transactions.read"><BankTransactionsView /></Guard>} />
        <Route path="/customer-payments" element={<Guard perm="customer_payments.read"><CustomerPaymentsList /></Guard>} />
        <Route path="/customer-payments/new" element={<Guard perm="customer_payments.create"><CustomerPaymentsCreate /></Guard>} />
        <Route path="/customer-payments/:id" element={<Guard perm="customer_payments.read"><CustomerPaymentsView /></Guard>} />
        <Route path="/expenses" element={<Guard perm="expenses.read"><ExpensesList /></Guard>} />
        <Route path="/expenses/new" element={<Guard perm="expenses.create"><ExpensesCreate /></Guard>} />
        <Route path="/expenses/:id" element={<Guard perm="expenses.read"><ExpensesView /></Guard>} />
        <Route path="/expenses/:id/edit" element={<Guard perm="expenses.update"><ExpensesUpdate /></Guard>} />
        <Route path="/payments" element={<Guard perm="payments.read"><PaymentsList /></Guard>} />
        <Route path="/payments/new" element={<Guard perm="payments.create"><PaymentsCreate /></Guard>} />
        <Route path="/payments/:id" element={<Guard perm="payments.read"><PaymentsView /></Guard>} />
        <Route path="/transfers" element={<Guard perm="transfers.read"><TransfersList /></Guard>} />
        <Route path="/transfers/new" element={<Guard perm="transfers.create"><TransfersCreate /></Guard>} />
        <Route path="/transfers/:id" element={<Guard perm="transfers.read"><TransfersView /></Guard>} />
        <Route path="/drivers" element={<Guard perm="drivers.read"><DriversList /></Guard>} />
        <Route path="/drivers/new" element={<Guard perm="drivers.create"><DriversCreate /></Guard>} />
        <Route path="/drivers/:id" element={<Guard perm="drivers.read"><DriversView /></Guard>} />
        <Route path="/drivers/:id/edit" element={<Guard perm="drivers.update"><DriversUpdate /></Guard>} />
        <Route path="/vehicles" element={<Guard perm="vehicles.read"><VehiclesList /></Guard>} />
        <Route path="/vehicles/new" element={<Guard perm="vehicles.create"><VehiclesCreate /></Guard>} />
        <Route path="/vehicles/:id" element={<Guard perm="vehicles.read"><VehiclesView /></Guard>} />
        <Route path="/vehicles/:id/edit" element={<Guard perm="vehicles.update"><VehiclesUpdate /></Guard>} />
        <Route path="/fuel-funding" element={<Guard perm="fuel_funding.read"><FuelFundingList /></Guard>} />
        <Route path="/fuel-funding/new" element={<Guard perm="fuel_funding.create"><FuelFundingCreate /></Guard>} />
        <Route path="/fuel-funding/:id" element={<Guard perm="fuel_funding.read"><FuelFundingView /></Guard>} />
        <Route path="/fuel-funding/:id/edit" element={<Guard perm="fuel_funding.update"><FuelFundingUpdate /></Guard>} />
        <Route path="/fuel-usage" element={<Guard perm="fuel_usage.read"><FuelUsageList /></Guard>} />
        <Route path="/fuel-usage/new" element={<Guard perm="fuel_usage.create"><FuelUsageCreate /></Guard>} />
        <Route path="/fuel-usage/:id" element={<Guard perm="fuel_usage.read"><FuelUsageView /></Guard>} />
        <Route path="/fuel-usage/:id/edit" element={<Guard perm="fuel_usage.update"><FuelUsageUpdate /></Guard>} />
        <Route path="/fuel-balances" element={<Guard perm="fuel_balances.read"><FuelBalancesList /></Guard>} />
        <Route path="/fuel-balances/:id" element={<Guard perm="fuel_balances.read"><FuelBalancesView /></Guard>} />
        <Route path="/fuel-reports" element={<Guard perm="fuel_reports.read"><FuelReportsList /></Guard>} />
        <Route path="/fuel-reports/new" element={<Guard perm="fuel_reports.read"><FuelReportsCreate /></Guard>} />
        <Route path="/fuel-reports/:type" element={<Guard perm="fuel_reports.read"><FuelReportsView /></Guard>} />
        <Route path="/fuel-reports/:type/edit" element={<Guard perm="fuel_reports.read"><FuelReportsUpdate /></Guard>} />
        <Route path="/reconciliation" element={<Guard perm="bank_transactions.reconcile"><ReconciliationPage /></Guard>} />
        {SALES_ORDERS && <>   {/* hidden for now: set VITE_ENABLE_SALES_ORDERS=true to bring back */}
        <Route path="/sales" element={<Guard perm="sales.read"><SalesList /></Guard>} />
        <Route path="/sales/:id" element={<Guard perm="sales.read"><SalesView /></Guard>} />
        </>}
        <Route path="/salespersons" element={<Guard perm="salespersons.read"><SalespersonsList /></Guard>} />
        <Route path="/salespersons/new" element={<Guard perm="salespersons.create"><SalespersonsCreate /></Guard>} />
        <Route path="/salespersons/:id" element={<Guard perm="salespersons.read"><SalespersonsView /></Guard>} />
        <Route path="/salespersons/:id/edit" element={<Guard perm="salespersons.update"><SalespersonsUpdate /></Guard>} />
        <Route path="/reports" element={<Guard perm={['stock_reports.read', 'stock_reports.statement']}><ReportsList /></Guard>} />
        <Route path="/reports/warehouse-statement" element={<Guard perm={['stock_reports.read', 'stock_reports.statement']}><WarehouseStatement /></Guard>} />
        <Route path="/reports/:type" element={<Guard perm="stock_reports.read"><ReportsView /></Guard>} />
        <Route path="/staff" element={<Guard perm="staff.read"><StaffList /></Guard>} />
        <Route path="/staff/new" element={<Guard perm="staff.create"><StaffForm /></Guard>} />
        <Route path="/staff/:id/edit" element={<Guard perm="staff.update"><StaffForm /></Guard>} />
        <Route path="/users" element={<Guard perm="users.read"><UserList /></Guard>} />
        <Route path="/users/new" element={<Guard perm="users.create"><UserCreate /></Guard>} />
        <Route path="/users/:id" element={<Guard perm="users.read"><UserView /></Guard>} />
        <Route path="/users/:id/edit" element={<Guard perm="users.update"><UserUpdate /></Guard>} />
        <Route path="/roles" element={<Guard perm="roles.read"><RolesPage /></Guard>} />
        <Route path="/audit" element={<Guard perm="audit.read"><AuditPage /></Guard>} />
        <Route path="/password" element={<ChangePasswordPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
