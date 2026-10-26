// Where the detail page of a sale lives: cash and credit sales have their own pages.
export const saleLink = (id, saleType) => (saleType === 'CASH' ? `/cash-sales/${id}` : `/credit-sales/${id}`);
export const saleCan = (can, saleType) => can(saleType === 'CASH' ? 'cash_sales.read' : 'credit_sales.read');
