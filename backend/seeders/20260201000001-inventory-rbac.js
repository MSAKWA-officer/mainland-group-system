'use strict';
const { Role, Permission } = require('../src/models');
const { ALL, ROLES, INVENTORY_MODULES } = require('../src/config/rbac');

// Adds the Phase 2 permissions and grants them to the default roles.
// Only touches inventory modules (addPermissions, never set), so Phase 1 grants edited in the UI are left alone.
module.exports = {
  async up() {
    const perms = {};
    for (const code of ALL.filter((c) => INVENTORY_MODULES.includes(c.split('.')[0]))) {
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
