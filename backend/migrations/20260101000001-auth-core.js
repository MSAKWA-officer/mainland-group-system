'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await q.createTable('roles', {
      id: pk, code: { type: T.STRING(30), allowNull: false, unique: true }, name: { type: T.STRING(60), allowNull: false },
      level: { type: T.INTEGER, allowNull: false }, description: T.TEXT,
      is_system: { type: T.BOOLEAN, allowNull: false, defaultValue: false }, ...ts,
    });
    await sql('ALTER TABLE roles ADD CONSTRAINT roles_level_chk CHECK (level BETWEEN 1 AND 100)');

    await q.createTable('permissions', {
      id: pk, code: { type: T.STRING(60), allowNull: false, unique: true },
      module: { type: T.STRING(40), allowNull: false }, description: T.TEXT, ...ts,
    });

    await q.createTable('role_permissions', {
      role_id: { ...fk('roles'), primaryKey: true, onDelete: 'CASCADE' },
      permission_id: { ...fk('permissions'), primaryKey: true, onDelete: 'CASCADE' },
    });

    await q.createTable('users', {
      id: pk, username: { type: T.STRING(30), allowNull: false, unique: true },
      full_name: { type: T.STRING(100), allowNull: false }, email: { type: T.STRING(150), unique: true }, phone: T.STRING(30),
      password_hash: { type: T.STRING(100), allowNull: false }, role_id: fk('roles'),
      status: { type: T.STRING(10), allowNull: false, defaultValue: 'ACTIVE' },
      failed_attempts: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
      locked_until: T.DATE, last_login_at: T.DATE,
      must_change_password: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
      password_changed_at: T.DATE, created_by: T.UUID, ...ts,
    });
    await sql("ALTER TABLE users ADD CONSTRAINT users_status_chk CHECK (status IN ('ACTIVE','INACTIVE'))");
    await sql("ALTER TABLE users ADD CONSTRAINT users_username_chk CHECK (username ~ '^[a-z0-9._-]{3,30}$')");
    await q.addIndex('users', ['role_id']);

    await q.createTable('sessions', {
      id: pk, user_id: fk('users'), refresh_hash: { type: T.STRING(64), allowNull: false },
      ip: T.STRING(64), user_agent: T.STRING(255), expires_at: { type: T.DATE, allowNull: false },
      revoked_at: T.DATE, created_at: now,
    });
    await q.addIndex('sessions', ['user_id']);

    // Delete policy enforced by the database itself: records are deactivated, never removed.
    await sql(`CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'Table % is protected: % is not allowed', TG_TABLE_NAME, TG_OP; END; $$ LANGUAGE plpgsql`);
    await sql('CREATE TRIGGER users_no_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION forbid_change()');
  },
  async down(q) {
    for (const t of ['sessions', 'users', 'role_permissions', 'permissions', 'roles']) await q.dropTable(t, { cascade: true });
    await q.sequelize.query('DROP FUNCTION IF EXISTS forbid_change() CASCADE');
  },
};
