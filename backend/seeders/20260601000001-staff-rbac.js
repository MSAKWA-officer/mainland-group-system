'use strict';
const { Role, Permission } = require('../src/models');
const { ALL, STAFF_MODULES } = require('../src/config/rbac');

// Adds the staff permissions and grants them to the Owner. Uses addPermissions (never set), so other grants are untouched.
module.exports = {
  async up() {
    const perms = [];
    for (const code of ALL.filter((c) => STAFF_MODULES.includes(c.split('.')[0]))) {
      const [p] = await Permission.findOrCreate({ where: { code }, defaults: { code, module: code.split('.')[0], description: code } });
      perms.push(p);
    }
    const owner = await Role.findOne({ where: { code: 'OWNER' } });
    if (owner) await owner.addPermissions(perms);
  },
  async down() {},
};
