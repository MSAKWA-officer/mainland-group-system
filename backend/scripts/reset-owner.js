
require('dotenv').config();

const sequelize = require('../src/config/sequelize');
const { User, Role } = require('../src/models');
const pw = require('../src/utils/password');

async function main() {
  const username = (
    process.env.RESET_OWNER_USERNAME || 'owner'
  ).trim().toLowerCase();

  const password = process.env.RESET_OWNER_PASSWORD;
  const confirmHost = process.env.CONFIRM_DB_HOST;
  const confirmName = process.env.CONFIRM_DB_NAME;

  if (!password) {
    throw new Error('RESET_OWNER_PASSWORD is required.');
  }

  const validation = pw.passwordRule.safeParse(password);

  if (!validation.success) {
    throw new Error(
      validation.error.issues.map((x) => x.message).join('; ')
    );
  }

  if (
    !confirmHost ||
    confirmHost !== process.env.DB_HOST ||
    !confirmName ||
    confirmName !== process.env.DB_NAME
  ) {
    throw new Error(
      'Database confirmation failed. Check DB_HOST and DB_NAME first.'
    );
  }

  await sequelize.authenticate();

  console.log('Connected database:', process.env.DB_NAME);
  console.log('Database host:', process.env.DB_HOST);

  const role = await Role.findOne({
    where: { code: 'OWNER' },
  });

  if (!role) {
    throw new Error(
      'OWNER role was not found. No account was changed.'
    );
  }

  const passwordHash = await pw.hash(password);

  let user = await User.findOne({
    where: { username },
  });

  if (user) {
    await user.update({
      passwordHash,
      roleId: role.id,
      status: 'ACTIVE',
      failedAttempts: 0,
      lockedUntil: null,
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    });

    console.log('Existing owner account updated:', username);
  } else {
    user = await User.create({
      username,
      fullName:
        process.env.RESET_OWNER_FULL_NAME || 'Company Owner',
      passwordHash,
      roleId: role.id,
      status: 'ACTIVE',
      failedAttempts: 0,
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    });

    console.log('Owner account created:', username);
  }

  console.log('Password reset completed successfully.');
}

main()
  .catch((error) => {
    console.error('Owner reset failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
