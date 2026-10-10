'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

/* Phase 4 - Approval workflow for sales orders.
   Salesperson -> Storekeeper -> Manager -> Salesperson.
   order_workflows        one row per sales order = where the order is right now.
   order_workflow_events  one row per step ever taken = the full status history. */
const STATUSES = ['AWAITING_STOREKEEPER', 'AWAITING_MANAGER', 'AWAITING_SALESPERSON', 'COMPLETED', 'RETURNED', 'REJECTED', 'CANCELLED'];

module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await q.createTable('order_workflows', {
      id: pk,
      order_id: fk('sales_orders', { onDelete: 'CASCADE', unique: true }),
      approval_id: fk('approval_requests', { allowNull: true }),                       // the approval request of the CURRENT cycle
      status: { type: T.STRING(24), allowNull: false, defaultValue: 'AWAITING_STOREKEEPER' },
      cycle: { type: T.INTEGER, allowNull: false, defaultValue: 1 },                  // +1 every time a returned order is sent again
      submitted_by: fk('users'), submitted_at: { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      storekeeper_id: fk('users', { allowNull: true }), storekeeper_at: T.DATE, storekeeper_note: T.TEXT,
      manager_id: fk('users', { allowNull: true }), manager_at: T.DATE, manager_note: T.TEXT,
      returned_from: T.STRING(12), returned_by: fk('users', { allowNull: true }), returned_at: T.DATE, return_note: T.TEXT,
      completed_by: fk('users', { allowNull: true }), completed_at: T.DATE, completed_note: T.TEXT,
      created_at: now, updated_at: now,
    });
    await sql(`ALTER TABLE order_workflows ADD CONSTRAINT order_workflows_status_chk CHECK (status IN (${STATUSES.map((s) => `'${s}'`).join(',')}))`);
    await sql("ALTER TABLE order_workflows ADD CONSTRAINT order_workflows_returned_chk CHECK (returned_from IS NULL OR returned_from IN ('STOREKEEPER','MANAGER'))");
    await sql('ALTER TABLE order_workflows ADD CONSTRAINT order_workflows_cycle_chk CHECK (cycle >= 1)');
    await q.addIndex('order_workflows', ['status']);
    await q.addIndex('order_workflows', ['storekeeper_id']);
    await q.addIndex('order_workflows', ['manager_id']);
    await q.addIndex('order_workflows', ['submitted_by']);

    await q.createTable('order_workflow_events', {
      id: { type: T.BIGINT, primaryKey: true, autoIncrement: true },
      workflow_id: fk('order_workflows', { onDelete: 'CASCADE' }),
      order_id: fk('sales_orders', { onDelete: 'CASCADE' }),
      cycle: { type: T.INTEGER, allowNull: false },
      action: { type: T.STRING(30), allowNull: false },
      from_status: T.STRING(24), to_status: { type: T.STRING(24), allowNull: false },
      actor_id: fk('users'), actor_role: { type: T.STRING(30), allowNull: false },
      note: T.TEXT, created_at: now,
    });
    await q.addIndex('order_workflow_events', ['workflow_id', 'id']);
    await q.addIndex('order_workflow_events', ['order_id']);
    await q.addIndex('order_workflow_events', ['actor_id']);
  },
  async down(q) {
    for (const t of ['order_workflow_events', 'order_workflows']) await q.dropTable(t, { cascade: true });
  },
};
