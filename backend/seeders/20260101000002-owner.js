'use strict';
const bcrypt = require('bcryptjs');
const { User, Role } = require('../src/models');

const make = async (username, fullName, roleCode, password) => {
  const role = await Role.findOne({ where: { code: roleCode } });
  await User.findOrCreate({ where: { username }, defaults: {
    username, fullName, roleId: role.id, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true,
  } });
};

module.exports = {
  async up() {
    const pw = process.env.OWNER_PASSWORD;
    if (!pw) throw new Error('Set OWNER_PASSWORD in .env to seed the first Owner');
    await make((process.env.OWNER_USERNAME || 'owner').toLowerCase(), process.env.OWNER_FULL_NAME || 'Company Owner', 'OWNER', pw);
    if (process.env.SEED_DEMO === 'true') {
      const d = process.env.DEMO_PASSWORD;
      await make('manager1', 'Demo Manager', 'MANAGER', d);
      await make('storekeeper1', 'Demo Storekeeper', 'STOREKEEPER', d);
      await make('sales1', 'Demo Salesperson', 'SALESPERSON', d);
    }
  },
  async down() {},
};
