'use strict';
const { Role, Permission } = require('../src/models');

// Adds the stock_reports.statement permission (Warehouse Inventory Statement only) and grants it to the Sales Person role.
// Uses addPermissions (never set), so grants you edited in the Roles screen are left alone. Safe to run more than once.
module.exports = {
  async up() {
    const code = 'stock_reports.statement';
    const [perm] = await Permission.findOrCreate({
      where: { code },
      defaults: { code, module: 'stock_reports', description: 'Warehouse Inventory Statement only' },
    });
    const role = await Role.findOne({ where: { code: 'SALESPERSON' } });
    if (role) await role.addPermissions([perm]);
  },
  async down() {},
};
