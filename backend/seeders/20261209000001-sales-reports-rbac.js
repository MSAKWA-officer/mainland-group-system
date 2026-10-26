'use strict';
const { Role, Permission } = require('../src/models');
const { ALL, ROLES, SALES_REPORT_MODULES } = require('../src/config/rbac');

// Adds sales_reports.read / sales_reports.export and grants them to Owner and Manager (addPermissions: never removes what you changed in Roles). Safe to run again.
module.exports = {
  async up() {
    const perms = {};
    for (const code of ALL.filter((c) => SALES_REPORT_MODULES.includes(c.split('.')[0]))) {
      const [p] = await Permission.findOrCreate({ where: { code }, defaults: { code, module: code.split('.')[0], description: code } });
      perms[code] = p;
    }
    for (const [code, def] of Object.entries(ROLES)) {
      const role = await Role.findOne({ where: { code } });
      if (!role) continue;
      const mine = def.permissions.filter((c) => perms[c]).map((c) => perms[c]);
      if (mine.length) await role.addPermissions(mine);
    }
  },
  async down() {},
};
