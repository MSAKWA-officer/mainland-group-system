'use strict';
const { Role, Permission } = require('../src/models');
const { ALL } = require('../src/config/rbac');

// Makes sure every permission exists and the Owner role holds all of them (so the Roles screen shows it too).
// Uses addPermissions (never set), so other roles are left alone. Safe to run more than once.
module.exports = {
  async up() {
    const owner = await Role.findOne({ where: { code: 'OWNER' } });
    if (!owner) return;
    const perms = [];
    for (const code of ALL) {
      const [p] = await Permission.findOrCreate({ where: { code }, defaults: { code, module: code.split('.')[0], description: code } });
      perms.push(p);
    }
    await owner.addPermissions(perms);
  },
  async down() {},
};
