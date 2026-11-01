'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

/* Fund receipts: money RECEIVED into a bank account (from the owner, head office, a loan, a grant ...) and earmarked for a purpose (fuel, expenses, other).
   Each receipt posts one DEPOSIT (CREDIT) to the bank ledger in the same database transaction.
   bank_transactions.fund_receipt_id links that ledger row to its receipt, so the row can only be voided by voiding the receipt. */
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE fund_receipt_seq START 1');
    await q.createTable('fund_receipts', {
      id: pk, receipt_no: { type: T.STRING(30), allowNull: false, unique: true },
      bank_account_id: fk('bank_accounts'),
      source: { type: T.STRING(15), allowNull: false },
      received_from: { type: T.STRING(150), allowNull: false },
      purpose: { type: T.STRING(10), allowNull: false },
      amount: { type: T.DECIMAL(20, 2), allowNull: false },
      receipt_date: { type: T.DATEONLY, allowNull: false },
      reference: T.STRING(100), notes: T.TEXT,
      status: { type: T.STRING(8), allowNull: false, defaultValue: 'POSTED' },
      voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT,
      created_by: fk('users'), ...ts,
    });
    await sql("ALTER TABLE fund_receipts ADD CONSTRAINT fund_receipts_chk CHECK (amount > 0 AND status IN ('POSTED','VOIDED') "
      + "AND source IN ('OWNER_CAPITAL','HEAD_OFFICE','LOAN','GRANT','OTHER') AND purpose IN ('FUEL','EXPENSES','OTHER'))");
    for (const c of ['bank_account_id', 'receipt_date', 'purpose', 'source', 'status']) await q.addIndex('fund_receipts', [c]);
    await sql('CREATE TRIGGER fund_receipts_no_delete BEFORE DELETE ON fund_receipts FOR EACH ROW EXECUTE FUNCTION forbid_change()');

    await sql('ALTER TABLE bank_transactions ADD COLUMN fund_receipt_id uuid REFERENCES fund_receipts(id) ON DELETE RESTRICT');
    await sql('CREATE INDEX bank_transactions_fund_receipt_idx ON bank_transactions (fund_receipt_id) WHERE fund_receipt_id IS NOT NULL');
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('DROP INDEX IF EXISTS bank_transactions_fund_receipt_idx');
    await sql('ALTER TABLE bank_transactions DROP COLUMN IF EXISTS fund_receipt_id');
    await q.dropTable('fund_receipts');
    await sql('DROP SEQUENCE IF EXISTS fund_receipt_seq');
  },
};
