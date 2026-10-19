'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

/* Reorder level PER WAREHOUSE.
   items.reorder_level stays the company-wide default. A row here overrides it for one item in one warehouse
   (a small branch store and the main warehouse rarely need the same minimum). No row = use the item's default. */
module.exports = {
  async up(q) {
    await q.createTable('warehouse_item_settings', {
      warehouse_id: { ...fk('warehouses'), primaryKey: true }, item_id: { ...fk('items'), primaryKey: true },
      reorder_level: { type: T.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
      updated_by: fk('users'), created_at: now, updated_at: now,
    });
    await q.sequelize.query('ALTER TABLE warehouse_item_settings ADD CONSTRAINT wh_item_settings_reorder_chk CHECK (reorder_level >= 0)');
    await q.addIndex('warehouse_item_settings', ['item_id']);
  },
  async down(q) { await q.dropTable('warehouse_item_settings'); },
};
