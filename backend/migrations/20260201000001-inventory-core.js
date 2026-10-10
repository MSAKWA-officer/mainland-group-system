'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });
const qty = (extra = {}) => ({ type: T.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });
const money = (extra = {}) => ({ type: T.DECIMAL(14, 2), allowNull: false, defaultValue: 0, ...extra });

module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE item_sku_seq START 1');

    await q.createTable('categories', {
      id: pk, name: { type: T.STRING(80), allowNull: false }, description: T.STRING(255),
      parent_id: fk('categories', { allowNull: true }),
      is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: fk('users'), ...ts,
    });
    await sql('CREATE UNIQUE INDEX categories_name_uq ON categories (LOWER(name))');
    await q.addIndex('categories', ['parent_id']);

    await q.createTable('items', {
      id: pk, sku: { type: T.STRING(40), allowNull: false, unique: true }, name: { type: T.STRING(150), allowNull: false },
      description: T.TEXT, barcode: T.STRING(60), category_id: fk('categories'),
      unit: { type: T.STRING(20), allowNull: false, defaultValue: 'pcs' },
      cost_price: money(), selling_price: money(), reorder_level: qty(),
      track_expiry: { type: T.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: fk('users'), ...ts,
    });
    await sql('CREATE UNIQUE INDEX items_barcode_uq ON items (barcode) WHERE barcode IS NOT NULL');
    await sql('ALTER TABLE items ADD CONSTRAINT items_prices_chk CHECK (cost_price >= 0 AND selling_price >= 0 AND reorder_level >= 0)');
    await q.addIndex('items', ['category_id']);
    await q.addIndex('items', ['name']);

    // One row per item: the current quantity on hand. Can never go negative (CHECK).
    await q.createTable('stock_levels', {
      item_id: { ...fk('items'), primaryKey: true }, quantity: qty(), updated_at: now,
    });
    await sql('ALTER TABLE stock_levels ADD CONSTRAINT stock_levels_qty_chk CHECK (quantity >= 0)');

    // Batches / expiry dates, only used for items with track_expiry = true.
    await q.createTable('stock_batches', {
      id: pk, item_id: fk('items'), batch_no: { type: T.STRING(60), allowNull: false },
      expiry_date: { type: T.DATEONLY, allowNull: false }, quantity: qty(), ...ts,
    });
    await sql('ALTER TABLE stock_batches ADD CONSTRAINT stock_batches_qty_chk CHECK (quantity >= 0)');
    await q.addIndex('stock_batches', ['item_id', 'batch_no'], { unique: true });
    await q.addIndex('stock_batches', ['expiry_date']);
  },
  async down(q) {
    for (const t of ['stock_batches', 'stock_levels', 'items', 'categories']) await q.dropTable(t, { cascade: true });
    await q.sequelize.query('DROP SEQUENCE IF EXISTS item_sku_seq');
  },
};
