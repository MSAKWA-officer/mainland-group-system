'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });
const money = (extra = {}) => ({ type: T.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

// Phase 5 - Banking & Payments: banks, bank accounts, bank transactions (ledger) and customer payments (allocated to credit sales).
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE bank_code_seq START 1');
    await sql('CREATE SEQUENCE bank_txn_seq START 1');
    await sql('CREATE SEQUENCE customer_payment_seq START 1');

    /* ---------------- Banks ---------------- */
    await q.createTable('banks', {
      id: pk, code: { type: T.STRING(20), allowNull: false, unique: true },
      name: { type: T.STRING(120), allowNull: false }, short_name: T.STRING(30), swift_code: T.STRING(11),
      country: { type: T.STRING(2), allowNull: false, defaultValue: 'TZ' }, phone: T.STRING(30), website: T.STRING(150), notes: T.STRING(255),
      is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true }, created_by: fk('users'), ...ts,
    });
    await sql('CREATE UNIQUE INDEX banks_name_uq ON banks (LOWER(name))');
    await q.addIndex('banks', ['is_active']);

    /* ---------------- Bank accounts ---------------- */
    await q.createTable('bank_accounts', {
      id: pk, bank_id: fk('banks'), account_no: { type: T.STRING(40), allowNull: false }, account_name: { type: T.STRING(150), allowNull: false },
      account_type: { type: T.STRING(12), allowNull: false, defaultValue: 'CURRENT' }, currency: { type: T.STRING(3), allowNull: false, defaultValue: 'TZS' },
      branch: T.STRING(100), opening_balance: money(), opening_date: { type: T.DATEONLY, allowNull: false, defaultValue: Sequelize.literal('CURRENT_DATE') },
      allow_overdraft: { type: T.BOOLEAN, allowNull: false, defaultValue: false }, notes: T.STRING(255),
      is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true }, created_by: fk('users'), ...ts,
    });
    await sql("ALTER TABLE bank_accounts ADD CONSTRAINT bank_accounts_type_chk CHECK (account_type IN ('CURRENT','SAVINGS','MOBILE_MONEY','OTHER'))");
    await sql('ALTER TABLE bank_accounts ADD CONSTRAINT bank_accounts_opening_chk CHECK (opening_balance >= 0)');
    await q.addIndex('bank_accounts', ['bank_id', 'account_no'], { unique: true });
    await q.addIndex('bank_accounts', ['is_active']);

    /* ---------------- Customer payments (created before bank_transactions, which points at them) ---------------- */
    await q.createTable('customer_payments', {
      id: pk, payment_no: { type: T.STRING(30), allowNull: false, unique: true }, customer_id: fk('customers'),
      amount: { type: T.DECIMAL(20, 2), allowNull: false }, method: { type: T.STRING(15), allowNull: false },
      bank_account_id: fk('bank_accounts', { allowNull: true }), reference: T.STRING(100),
      paid_on: { type: T.DATEONLY, allowNull: false, defaultValue: Sequelize.literal('CURRENT_DATE') }, notes: T.TEXT,
      status: { type: T.STRING(8), allowNull: false, defaultValue: 'ACTIVE' },
      received_by: fk('users'), voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_chk CHECK (amount > 0 AND method IN ('CASH','MOBILE_MONEY','BANK','CARD','CHEQUE') AND status IN ('ACTIVE','VOIDED'))");
    await sql("ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_bank_chk CHECK (method IN ('CASH','MOBILE_MONEY') OR bank_account_id IS NOT NULL)");
    for (const c of ['customer_id', 'bank_account_id', 'paid_on', 'status', 'received_by']) await q.addIndex('customer_payments', [c]);

    await q.createTable('customer_payment_allocations', {
      id: pk, customer_payment_id: fk('customer_payments'), sale_id: fk('sales'),
      sale_payment_id: fk('sale_payments', { unique: true }),                    // the sale_payments row that feeds Payment History / Balances / Ageing
      amount: { type: T.DECIMAL(20, 2), allowNull: false }, created_at: now,
    });
    await sql('ALTER TABLE customer_payment_allocations ADD CONSTRAINT cpa_amount_chk CHECK (amount > 0)');
    await q.addIndex('customer_payment_allocations', ['customer_payment_id']);
    await q.addIndex('customer_payment_allocations', ['sale_id']);

    /* ---------------- Bank transactions (ledger) ---------------- */
    await q.createTable('bank_transactions', {
      id: pk, txn_no: { type: T.STRING(30), allowNull: false, unique: true }, bank_account_id: fk('bank_accounts'),
      type: { type: T.STRING(20), allowNull: false }, direction: { type: T.STRING(6), allowNull: false },
      amount: { type: T.DECIMAL(20, 2), allowNull: false }, txn_date: { type: T.DATEONLY, allowNull: false },
      reference: T.STRING(100), description: T.STRING(255), counterparty: T.STRING(150),
      transfer_group_id: { type: T.UUID, allowNull: true },                         // the two legs of an inter-account transfer share this id
      customer_payment_id: fk('customer_payments', { allowNull: true }),
      status: { type: T.STRING(8), allowNull: false, defaultValue: 'POSTED' },
      is_reconciled: { type: T.BOOLEAN, allowNull: false, defaultValue: false }, reconciled_at: T.DATE, reconciled_by: fk('users', { allowNull: true }),
      voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT,
      created_by: fk('users'), ...ts,
    });
    await sql("ALTER TABLE bank_transactions ADD CONSTRAINT bank_txn_chk CHECK (amount > 0 AND status IN ('POSTED','VOIDED') AND direction IN ('CREDIT','DEBIT'))");
    await sql("ALTER TABLE bank_transactions ADD CONSTRAINT bank_txn_type_chk CHECK ("
      + "(type IN ('DEPOSIT','TRANSFER_IN','INTEREST','CUSTOMER_PAYMENT') AND direction = 'CREDIT') OR "
      + "(type IN ('WITHDRAWAL','TRANSFER_OUT','CHARGE') AND direction = 'DEBIT'))");
    await sql("ALTER TABLE bank_transactions ADD CONSTRAINT bank_txn_reconciled_chk CHECK (is_reconciled = false OR status = 'POSTED')");
    for (const c of ['bank_account_id', 'txn_date', 'type', 'status', 'transfer_group_id', 'customer_payment_id', 'is_reconciled']) await q.addIndex('bank_transactions', [c]);
    await q.addIndex('bank_transactions', ['bank_account_id', 'txn_date']);

    // Ledger rows are never deleted or rewritten: only POSTED -> VOIDED and the reconciled flag may change.
    await sql(`CREATE OR REPLACE FUNCTION bank_transactions_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Bank transactions cannot be deleted. Void the transaction instead.'; END IF;
        IF NEW.txn_no <> OLD.txn_no OR NEW.bank_account_id <> OLD.bank_account_id OR NEW.type <> OLD.type OR NEW.direction <> OLD.direction
           OR NEW.amount <> OLD.amount OR NEW.txn_date <> OLD.txn_date THEN
          RAISE EXCEPTION 'Bank transaction details cannot be changed. Void the transaction and post a new one.';
        END IF;
        IF OLD.status = 'VOIDED' AND NEW.status <> 'VOIDED' THEN RAISE EXCEPTION 'A voided bank transaction cannot be reopened.'; END IF;
        IF OLD.is_reconciled AND NEW.status = 'VOIDED' THEN RAISE EXCEPTION 'A reconciled bank transaction cannot be voided. Un-reconcile it first.'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await sql('CREATE TRIGGER bank_transactions_no_rewrite BEFORE UPDATE OR DELETE ON bank_transactions FOR EACH ROW EXECUTE FUNCTION bank_transactions_guard()');
    await sql('CREATE TRIGGER bank_transactions_no_truncate BEFORE TRUNCATE ON bank_transactions FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()');

    // Customer payments and their allocations are permanent records: never deleted (a payment is voided instead).
    await sql('CREATE TRIGGER customer_payments_no_delete BEFORE DELETE ON customer_payments FOR EACH ROW EXECUTE FUNCTION forbid_change()');
    await sql('CREATE TRIGGER customer_payment_allocations_no_delete BEFORE DELETE ON customer_payment_allocations FOR EACH ROW EXECUTE FUNCTION forbid_change()');
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    for (const t of ['bank_transactions', 'customer_payment_allocations', 'customer_payments', 'bank_accounts', 'banks']) await q.dropTable(t, { cascade: true });
    await sql('DROP FUNCTION IF EXISTS bank_transactions_guard() CASCADE');
    for (const s of ['bank_code_seq', 'bank_txn_seq', 'customer_payment_seq']) await sql(`DROP SEQUENCE IF EXISTS ${s}`);
  },
};
