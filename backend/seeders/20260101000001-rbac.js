'use strict';
const { Role, Permission } = require('../src/models');
const { ALL, ROLES } = require('../src/config/rbac');

module.exports = {
  async up() {
    const perms = {};
    for (const code of ALL) {
      const [p] = await Permission.findOrCreate({ where: { code }, defaults: { code, module: code.split('.')[0], description: code } });
      perms[code] = p;
    }
    for (const [code, def] of Object.entries(ROLES)) {
      const [role] = await Role.findOrCreate({ where: { code }, defaults: { code, name: def.name, level: def.level, description: def.description, isSystem: true } });
      await role.setPermissions(def.permissions.map((c) => perms[c]));
    }
  },
  async down() {},
};
