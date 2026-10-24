'use strict';
const { Role, Permission } = require('../src/models');
const { ALL, ROLES, PHYSICAL_COUNT_MODULES } = require('../src/config/rbac');

// Adds the Physical Count permissions (physical_counts.read / create / void) and grants them to the default roles
// (Owner: all, Manager: all, Storekeeper: read + create). Uses addPermissions (never set), so grants you edited in the Roles screen are left alone. Safe to run more than once.
module.exports = {
  async up() {
    const perms = {};
    for (const code of ALL.filter((c) => PHYSICAL_COUNT_MODULES.includes(c.split('.')[0]))) {
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
