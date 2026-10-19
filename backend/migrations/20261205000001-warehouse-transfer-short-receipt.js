'use strict';

/* The receiving salesperson may now report a problem instead of confirming in full:
     IN_TRANSIT -> COMPLETED       (received everything)
     IN_TRANSIT -> RECEIVED_SHORT  (received less: only the received quantities enter the destination)
     IN_TRANSIT -> NOT_RECEIVED    (nothing arrived)
   Whatever was not received goes back into the SOURCE warehouse (movement TRANSFER_RETURN), so company-wide stock stays equal to the sum of the warehouses.
   The Manager follows the problem up outside the system (e.g. a write-off on the source warehouse if the goods are really lost). */
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('ALTER TABLE warehouse_transfers DROP CONSTRAINT wh_tr_status_chk');
    await sql("ALTER TABLE warehouse_transfers ADD CONSTRAINT wh_tr_status_chk CHECK (status IN ('SUBMITTED','IN_TRANSIT','COMPLETED','RECEIVED_SHORT','NOT_RECEIVED','REJECTED','CANCELLED'))");
    await sql('ALTER TABLE warehouse_transfer_lines ADD COLUMN received_qty NUMERIC(14,3)');
    await sql('ALTER TABLE warehouse_transfer_lines ADD CONSTRAINT wh_tr_line_recv_chk CHECK (received_qty IS NULL OR (received_qty >= 0 AND received_qty <= quantity))');
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql("UPDATE warehouse_transfers SET status = 'COMPLETED' WHERE status IN ('RECEIVED_SHORT','NOT_RECEIVED')");
    await sql('ALTER TABLE warehouse_transfer_lines DROP CONSTRAINT IF EXISTS wh_tr_line_recv_chk');
    await sql('ALTER TABLE warehouse_transfer_lines DROP COLUMN IF EXISTS received_qty');
    await sql('ALTER TABLE warehouse_transfers DROP CONSTRAINT wh_tr_status_chk');
    await sql("ALTER TABLE warehouse_transfers ADD CONSTRAINT wh_tr_status_chk CHECK (status IN ('SUBMITTED','IN_TRANSIT','COMPLETED','REJECTED','CANCELLED'))");
  },
};
