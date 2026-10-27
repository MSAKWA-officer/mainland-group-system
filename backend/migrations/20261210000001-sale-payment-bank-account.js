'use strict';
/* Cash sales: malipo ya Benki / Kadi / Pesa ya simu yanahusishwa na akaunti iliyosajiliwa (bank_accounts).
   Mauzo ya zamani yanabaki na bank_account_id = NULL. */
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('ALTER TABLE sale_payments ADD COLUMN bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE RESTRICT');
    await sql('CREATE INDEX sale_payments_bank_account_idx ON sale_payments (bank_account_id) WHERE bank_account_id IS NOT NULL');
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('DROP INDEX IF EXISTS sale_payments_bank_account_idx');
    await sql('ALTER TABLE sale_payments DROP COLUMN IF EXISTS bank_account_id');
  },
};
