'use strict';
const { Role, Permission } = require('../src/models');
const { ALL, ROLES, WORKFLOW_MODULES } = require('../src/config/rbac');

// Adds the Phase 4 (approval workflow) permissions and grants them to the default roles.
// Uses addPermissions (never set), so grants you edited in the Roles screen are left alone. Safe to run more than once.
module.exports = {
  async up() {
    const perms = {};
    for (const code of ALL.filter((c) => WORKFLOW_MODULES.includes(c.split('.')[0]))) {
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
