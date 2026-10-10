'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

// Banking & Payments - Expenses and (outgoing) Payments. Transfers need no new table: they use bank_transactions.
// Also adds bank_transactions.payment_id so a bank row created by a payment can only be voided through that payment.
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE expense_seq START 1');
    await sql('CREATE SEQUENCE payment_seq START 1');

    await q.createTable('expenses', {
      id: pk, expense_no: { type: T.STRING(30), allowNull: false, unique: true }, category: { type: T.STRING(20), allowNull: false },
      description: { type: T.STRING(255), allowNull: false }, payee: T.STRING(150), reference: T.STRING(100),
      amount: { type: T.DECIMAL(20, 2), allowNull: false }, expense_date: { type: T.DATEONLY, allowNull: false }, notes: T.TEXT,
      status: { type: T.STRING(10), allowNull: false, defaultValue: 'PENDING' },
      created_by: fk('users'), decided_by: fk('users', { allowNull: true }), decided_at: T.DATE, decision_note: T.TEXT,
      voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE expenses ADD CONSTRAINT expenses_chk CHECK (amount > 0 AND status IN ('PENDING','APPROVED','REJECTED','VOIDED') "
      + "AND category IN ('RENT','UTILITIES','SALARIES','TRANSPORT','FUEL','MARKETING','MAINTENANCE','OFFICE','TAXES','BANK_CHARGES','OTHER'))");
    for (const c of ['category', 'status', 'expense_date', 'created_by']) await q.addIndex('expenses', [c]);

    await q.createTable('payments', {
      id: pk, payment_no: { type: T.STRING(30), allowNull: false, unique: true }, expense_id: fk('expenses', { allowNull: true }),
      payee: { type: T.STRING(150), allowNull: false }, amount: { type: T.DECIMAL(20, 2), allowNull: false }, method: { type: T.STRING(15), allowNull: false },
      bank_account_id: fk('bank_accounts', { allowNull: true }), reference: T.STRING(100),
      paid_on: { type: T.DATEONLY, allowNull: false, defaultValue: Sequelize.literal('CURRENT_DATE') }, notes: T.TEXT,
      status: { type: T.STRING(8), allowNull: false, defaultValue: 'ACTIVE' },
      created_by: fk('users'), voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE payments ADD CONSTRAINT payments_chk CHECK (amount > 0 AND method IN ('CASH','MOBILE_MONEY','BANK','CARD','CHEQUE') AND status IN ('ACTIVE','VOIDED'))");
    await sql("ALTER TABLE payments ADD CONSTRAINT payments_bank_chk CHECK (method IN ('CASH','MOBILE_MONEY') OR bank_account_id IS NOT NULL)");
    for (const c of ['expense_id', 'bank_account_id', 'paid_on', 'status', 'created_by']) await q.addIndex('payments', [c]);

    await q.addColumn('bank_transactions', 'payment_id', { type: T.UUID, allowNull: true, references: { model: 'payments', key: 'id' }, onDelete: 'RESTRICT' });
    await q.addIndex('bank_transactions', ['payment_id']);

    // Permanent records: never deleted (an expense or payment is voided instead).
    await sql('CREATE TRIGGER expenses_no_delete BEFORE DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION forbid_change()');
    await sql('CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION forbid_change()');
  },
  async down(q) {
    await q.removeColumn('bank_transactions', 'payment_id');
    for (const t of ['payments', 'expenses']) await q.dropTable(t, { cascade: true });
    for (const s of ['expense_seq', 'payment_seq']) await q.sequelize.query(`DROP SEQUENCE IF EXISTS ${s}`);
  },
};
