'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

/* Physical Count (stock-take).
   A count says "on <date>, in <warehouse>, we counted these quantities". It NEVER changes stock (a difference is corrected, if the business wants,
   with a normal Stock Adjustment). The Warehouse Inventory Statement reads the latest count of each item inside its period and shows it in the
   "Physical Count" / "Inventory Variance" columns.
   book_qty = what the books said at the end of count_date, saved when the count is recorded, so the difference of an old count never changes later. */
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE physical_count_seq START 1');

    await q.createTable('physical_counts', {
      id: pk, count_no: { type: T.STRING(30), allowNull: false, unique: true },
      warehouse_id: fk('warehouses'),
      count_date: { type: T.DATEONLY, allowNull: false },
      status: { type: T.STRING(8), allowNull: false, defaultValue: 'POSTED' },
      note: T.STRING(500),
      created_by: fk('users'),
      voided_by: fk('users', { allowNull: true }), voided_at: T.DATE, void_reason: T.STRING(500),
      created_at: now, updated_at: now,
    });
    await sql("ALTER TABLE physical_counts ADD CONSTRAINT physical_counts_status_chk CHECK (status IN ('POSTED','VOID'))");
    await q.addIndex('physical_counts', ['warehouse_id', 'count_date']);
    await q.addIndex('physical_counts', ['status']);
    await q.addIndex('physical_counts', ['created_by']);

    await q.createTable('physical_count_lines', {
      id: pk, count_id: fk('physical_counts', { onDelete: 'CASCADE' }), item_id: fk('items'),
      counted_qty: { type: T.DECIMAL(14, 3), allowNull: false },
      book_qty: { type: T.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
      remarks: T.STRING(255), created_at: now,
    });
    await sql('ALTER TABLE physical_count_lines ADD CONSTRAINT physical_count_lines_qty_chk CHECK (counted_qty >= 0)');
    await sql('CREATE UNIQUE INDEX physical_count_lines_uq ON physical_count_lines (count_id, item_id)');
    await q.addIndex('physical_count_lines', ['item_id']);
  },
  async down(q) {
    await q.dropTable('physical_count_lines');
    await q.dropTable('physical_counts');
    await q.sequelize.query('DROP SEQUENCE IF EXISTS physical_count_seq');
  },
};
