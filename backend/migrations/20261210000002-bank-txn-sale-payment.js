'use strict';
/* Cash / Credit sale payments taken into a registered bank or mobile money account now post a CREDIT row to the bank ledger,
   so the account balance goes up. bank_transactions.sale_payment_id links the ledger row to its sale payment: such a row can only be
   voided by voiding the sale payment (or the cash sale), like payment_id / fuel_funding_id.
   The backfill posts the payments already saved with a bank account (recorded before this change) that have no ledger row yet. */
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('ALTER TABLE bank_transactions ADD COLUMN sale_payment_id uuid REFERENCES sale_payments(id) ON DELETE RESTRICT');
    await sql('CREATE INDEX bank_transactions_sale_payment_idx ON bank_transactions (sale_payment_id) WHERE sale_payment_id IS NOT NULL');
    await sql(`INSERT INTO bank_transactions (id, txn_no, bank_account_id, type, direction, amount, txn_date, reference, description, counterparty,
        sale_payment_id, status, is_reconciled, created_by, created_at, updated_at)
      SELECT gen_random_uuid(), 'BTX-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('bank_txn_seq')::text, 6, '0'), sp.bank_account_id,
        'CUSTOMER_PAYMENT', 'CREDIT', sp.amount, GREATEST(COALESCE(sp.paid_on, sp.created_at::date), ba.opening_date), sp.reference,
        LEFT(s.sale_no || ' - receipt ' || sp.receipt_no, 255), LEFT(COALESCE(c.name, s.walk_in_name, 'Walk-in customer'), 150),
        sp.id, 'POSTED', false, sp.received_by, now(), now()
      FROM sale_payments sp
        JOIN sales s ON s.id = sp.sale_id
        JOIN bank_accounts ba ON ba.id = sp.bank_account_id
        LEFT JOIN customers c ON c.id = s.customer_id
      WHERE sp.bank_account_id IS NOT NULL AND sp.voided_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM bank_transactions x WHERE x.sale_payment_id = sp.id)
      ORDER BY sp.created_at`);
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('DROP INDEX IF EXISTS bank_transactions_sale_payment_idx');
    await sql('ALTER TABLE bank_transactions DROP COLUMN IF EXISTS sale_payment_id');
  },
};
