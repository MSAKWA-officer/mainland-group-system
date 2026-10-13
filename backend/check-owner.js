// Run from the backend folder (same level as package.json):
//   node check-owner.js
// Uses the app's OWN models and password helper, so the hash always matches login.
require('dotenv').config();

const { User, Role, sequelize } = require('./src/models');
const pw = require('./src/utils/password');

(async () => {
  await sequelize.authenticate();

  const roles = await Role.findAll({ attributes: ['code'] });
  console.log('Roles in DB:', roles.map((r) => r.code));

  const users = await User.findAll({
    attributes: ['username', 'status', 'failedAttempts', 'lockedUntil'],
  });
  console.log('Users in DB:', users.map((u) => u.toJSON()));

  const username = (process.env.OWNER_USERNAME || 'owner').toLowerCase();
  const newPassword = process.env.OWNER_PASSWORD;

  if (!newPassword) {
    console.log('Set OWNER_PASSWORD to create/reset the owner. Only checked, nothing changed.');
    await sequelize.close();
    return;
  }

  let user = await User.findOne({ where: { username } });

  if (user) {
    await user.update({
      passwordHash: await pw.hash(newPassword),
      status: 'ACTIVE',
      failedAttempts: 0,
      lockedUntil: null,
      mustChangePassword: true,
    });
    console.log(`Password reset for "${username}".`);
  } else {
    const role = await Role.findOne({ where: { code: 'OWNER' } });
    if (!role) throw new Error('OWNER role not found. Run the roles seeder first.');

    user = await User.create({
      username,
      fullName: process.env.OWNER_FULL_NAME || 'Company Owner',
      roleId: role.id,
      passwordHash: await pw.hash(newPassword),
      mustChangePassword: true,
    });
    console.log(`User "${username}" created.`);
  }

  await sequelize.close();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});