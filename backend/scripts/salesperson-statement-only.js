// Makes the Sales Person role see ONE stock report only: the Warehouse Inventory Statement.
//  - adds    stock_reports.statement
//  - removes stock_reports.read and stock_reports.valuation (these open every other stock report)
// Safe to run more than once. Run from the backend folder:  node scripts/salesperson-statement-only.js
require('dotenv').config();
const sequelize = require('../src/config/sequelize');
const { Role, Permission } = require('../src/models');

(async () => {
  const role = await Role.findOne({ where: { code: 'SALESPERSON' } });
  if (!role) throw new Error('Role SALESPERSON not found');
  const [statement] = await Permission.findOrCreate({
    where: { code: 'stock_reports.statement' },
    defaults: { code: 'stock_reports.statement', module: 'stock_reports', description: 'Warehouse Inventory Statement only' },
  });
  const drop = await Permission.findAll({ where: { code: ['stock_reports.read', 'stock_reports.valuation'] } });
  await role.addPermissions([statement]);
  if (drop.length) await role.removePermissions(drop);
  const now = (await role.getPermissions()).map((p) => p.code).filter((c) => c.startsWith('stock_reports.'));
  console.log('Sales Person stock_reports permissions now:', now.join(', ') || '(none)');
})().catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; }).finally(() => sequelize.close());
