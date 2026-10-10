'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await q.createTable('audit_logs', {
      id: { type: T.BIGINT, primaryKey: true, autoIncrement: true },
      occurred_at: { type: T.DATE, allowNull: false }, user_id: T.UUID, username: T.STRING(30),
      action: { type: T.STRING(60), allowNull: false }, entity_type: T.STRING(60), entity_id: T.STRING(100),
      old_values: T.JSONB, new_values: T.JSONB, reason: T.TEXT,
      outcome: { type: T.STRING(10), allowNull: false, defaultValue: 'SUCCESS' },
      ip: T.STRING(64), user_agent: T.STRING(255),
      prev_hash: { type: T.STRING(64), allowNull: false }, hash: { type: T.STRING(64), allowNull: false },
    });
    await sql("ALTER TABLE audit_logs ADD CONSTRAINT audit_outcome_chk CHECK (outcome IN ('SUCCESS','DENIED','FAILED'))");
    for (const c of [['occurred_at'], ['user_id'], ['action'], ['entity_type', 'entity_id']]) await q.addIndex('audit_logs', c);
    // Append-only: no UPDATE / DELETE / TRUNCATE, even for the application database user.
    await sql('CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_change()');
    await sql('CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()');

    await q.createTable('approval_requests', {
      id: pk, type: { type: T.STRING(60), allowNull: false }, entity_type: T.STRING(60), entity_id: T.STRING(100),
      payload: { type: T.JSONB, allowNull: false, defaultValue: {} },
      status: { type: T.STRING(12), allowNull: false, defaultValue: 'DRAFT' },
      requested_by: fk('users'), submitted_at: T.DATE, decided_by: { ...fk('users'), allowNull: true },
      decided_at: T.DATE, decision_note: T.TEXT, executed_at: T.DATE, created_at: now, updated_at: now,
    });
    await sql("ALTER TABLE approval_requests ADD CONSTRAINT approval_status_chk CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','EXECUTED','CANCELLED'))");
    // Segregation of duties enforced in the database too
    await sql('ALTER TABLE approval_requests ADD CONSTRAINT approval_no_self_decision CHECK (decided_by IS NULL OR decided_by <> requested_by)');
    await q.addIndex('approval_requests', ['status']);
    await q.addIndex('approval_requests', ['requested_by']);

    await q.createTable('notifications', {
      id: pk, user_id: fk('users'), title: { type: T.STRING(150), allowNull: false }, body: T.TEXT,
      link: T.STRING(200), read_at: T.DATE, created_at: now,
    });
    await q.addIndex('notifications', ['user_id', 'read_at']);

    await q.createTable('attachments', {
      id: pk, original_name: { type: T.STRING(255), allowNull: false }, stored_name: { type: T.STRING(80), allowNull: false },
      mime: { type: T.STRING(80), allowNull: false }, size: { type: T.INTEGER, allowNull: false },
      sha256: { type: T.STRING(64), allowNull: false }, uploaded_by: fk('users'),
      entity_type: T.STRING(60), entity_id: T.STRING(100), created_at: now,
    });
  },
  async down(q) {
    for (const t of ['attachments', 'notifications', 'approval_requests', 'audit_logs']) await q.dropTable(t, { cascade: true });
  },
};
