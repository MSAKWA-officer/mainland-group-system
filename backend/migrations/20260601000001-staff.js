'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };

// Staff directory: people are registered here first (no login). An Owner later gives them an account from User management,
// which fills staff.user_id.
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE staff_code_seq START 1');
    await q.createTable('staff', {
      id: pk, code: { type: T.STRING(20), allowNull: false, unique: true },
      full_name: { type: T.STRING(100), allowNull: false }, phone: T.STRING(30), email: T.STRING(150),
      position: T.STRING(80), address: T.STRING(255),
      user_id: { type: T.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT' },
      is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: T.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT' },
      created_at: now, updated_at: now,
    });
    await sql('CREATE UNIQUE INDEX staff_user_uq ON staff (user_id) WHERE user_id IS NOT NULL');   // one account per staff member
    await q.addIndex('staff', ['full_name']);
  },
  async down(q) {
    await q.dropTable('staff');
    await q.sequelize.query('DROP SEQUENCE IF EXISTS staff_code_seq');
  },
};
