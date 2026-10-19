'use strict';

/* Transfers into a salesperson's warehouse need the salesperson to confirm receipt.
   SUBMITTED -> (Manager approves: stock leaves the source) IN_TRANSIT -> (salesperson confirms) COMPLETED.
   Transfers into a warehouse with no salesperson still complete at approval, as before. */
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('ALTER TABLE warehouse_transfers DROP CONSTRAINT wh_tr_status_chk');
    await sql("ALTER TABLE warehouse_transfers ADD CONSTRAINT wh_tr_status_chk CHECK (status IN ('SUBMITTED','IN_TRANSIT','COMPLETED','REJECTED','CANCELLED'))");
    await sql('ALTER TABLE warehouse_transfers ADD COLUMN requires_receipt BOOLEAN NOT NULL DEFAULT FALSE');
    await sql('ALTER TABLE warehouse_transfers ADD COLUMN approved_at TIMESTAMPTZ');
    await sql('ALTER TABLE warehouse_transfers ADD COLUMN received_by UUID REFERENCES users(id) ON DELETE RESTRICT');
    await sql('ALTER TABLE warehouse_transfers ADD COLUMN received_at TIMESTAMPTZ');
    await sql('ALTER TABLE warehouse_transfers ADD COLUMN receive_note VARCHAR(500)');
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql("UPDATE warehouse_transfers SET status = 'COMPLETED' WHERE status = 'IN_TRANSIT'");
    for (const c of ['receive_note', 'received_at', 'received_by', 'approved_at', 'requires_receipt']) await sql(`ALTER TABLE warehouse_transfers DROP COLUMN IF EXISTS ${c}`);
    await sql('ALTER TABLE warehouse_transfers DROP CONSTRAINT wh_tr_status_chk');
    await sql("ALTER TABLE warehouse_transfers ADD CONSTRAINT wh_tr_status_chk CHECK (status IN ('SUBMITTED','COMPLETED','REJECTED','CANCELLED'))");
  },
};
