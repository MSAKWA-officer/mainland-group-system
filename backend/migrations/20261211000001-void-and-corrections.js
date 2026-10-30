'use strict';
/* "Delete" for posted stock documents and warehouse transfers = REVERSE: the stock goes back through opposite ledger rows and the document is
   kept with status VOIDED, who voided it, when and why (the movement ledgers are append-only by design).
   An edited posted stock document is a CORRECTION: the old one is reversed and a new one is posted in the same transaction (replaced_by_id links them). */
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('ALTER TABLE stock_documents ADD COLUMN voided_at timestamptz, ADD COLUMN voided_by uuid REFERENCES users(id) ON DELETE RESTRICT, ADD COLUMN void_reason text, ADD COLUMN replaced_by_id uuid REFERENCES stock_documents(id) ON DELETE RESTRICT');
    await sql('ALTER TABLE stock_documents DROP CONSTRAINT stock_doc_status_chk');
    await sql("ALTER TABLE stock_documents ADD CONSTRAINT stock_doc_status_chk CHECK (status IN ('DRAFT','SUBMITTED','POSTED','REJECTED','CANCELLED','VOIDED'))");
    await sql('ALTER TABLE warehouse_transfers ADD COLUMN voided_at timestamptz, ADD COLUMN voided_by uuid REFERENCES users(id) ON DELETE RESTRICT, ADD COLUMN void_reason varchar(500)');
    await sql('ALTER TABLE warehouse_transfers DROP CONSTRAINT wh_tr_status_chk');
    await sql("ALTER TABLE warehouse_transfers ADD CONSTRAINT wh_tr_status_chk CHECK (status IN ('SUBMITTED','IN_TRANSIT','COMPLETED','RECEIVED_SHORT','NOT_RECEIVED','REJECTED','CANCELLED','VOIDED'))");
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql("UPDATE stock_documents SET status = 'CANCELLED' WHERE status = 'VOIDED'");
    await sql('ALTER TABLE stock_documents DROP CONSTRAINT stock_doc_status_chk');
    await sql("ALTER TABLE stock_documents ADD CONSTRAINT stock_doc_status_chk CHECK (status IN ('DRAFT','SUBMITTED','POSTED','REJECTED','CANCELLED'))");
    await sql('ALTER TABLE stock_documents DROP COLUMN voided_at, DROP COLUMN voided_by, DROP COLUMN void_reason, DROP COLUMN replaced_by_id');
    await sql("UPDATE warehouse_transfers SET status = 'CANCELLED' WHERE status = 'VOIDED'");
    await sql('ALTER TABLE warehouse_transfers DROP CONSTRAINT wh_tr_status_chk');
    await sql("ALTER TABLE warehouse_transfers ADD CONSTRAINT wh_tr_status_chk CHECK (status IN ('SUBMITTED','IN_TRANSIT','COMPLETED','RECEIVED_SHORT','NOT_RECEIVED','REJECTED','CANCELLED'))");
    await sql('ALTER TABLE warehouse_transfers DROP COLUMN voided_at, DROP COLUMN voided_by, DROP COLUMN void_reason');
  },
};
