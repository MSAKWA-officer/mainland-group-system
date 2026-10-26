'use strict';
/* EFD numbers are now recorded against a SALE (cash or credit, COMPLETED) instead of a sales order, so the EFD module works without
   Sales orders. Existing receipts keep their order link and also get the matching sale (sales.sales_order_id) as sale_id. */
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('ALTER TABLE efd_receipts ADD COLUMN sale_id uuid REFERENCES sales(id) ON DELETE RESTRICT');
    await sql('UPDATE efd_receipts r SET sale_id = s.id FROM sales s WHERE s.sales_order_id = r.sales_order_id AND r.sale_id IS NULL');   // before the guard below
    await sql('ALTER TABLE efd_receipts ALTER COLUMN sales_order_id DROP NOT NULL');
    await sql('ALTER TABLE efd_receipts ADD CONSTRAINT efd_receipts_target_chk CHECK (sale_id IS NOT NULL OR sales_order_id IS NOT NULL)');
    await sql("CREATE UNIQUE INDEX efd_receipts_sale_uq ON efd_receipts (sale_id) WHERE status = 'ISSUED' AND sale_id IS NOT NULL");   // one live receipt per sale
    await sql('CREATE INDEX efd_receipts_sale_id_idx ON efd_receipts (sale_id)');
    await sql(`CREATE OR REPLACE FUNCTION efd_receipts_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'EFD receipts cannot be deleted. Void the receipt instead.'; END IF;
        IF NEW.receipt_no <> OLD.receipt_no OR NEW.device_id <> OLD.device_id OR NEW.sales_order_id IS DISTINCT FROM OLD.sales_order_id
           OR NEW.sale_id IS DISTINCT FROM OLD.sale_id
           OR NEW.amount <> OLD.amount OR NEW.vat_amount <> OLD.vat_amount OR NEW.issued_at <> OLD.issued_at THEN
          RAISE EXCEPTION 'EFD receipt details cannot be changed. Void the receipt and record a new one.';
        END IF;
        IF OLD.status = 'VOIDED' AND NEW.status <> 'VOIDED' THEN RAISE EXCEPTION 'A voided EFD receipt cannot be reopened.'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql(`CREATE OR REPLACE FUNCTION efd_receipts_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'EFD receipts cannot be deleted. Void the receipt instead.'; END IF;
        IF NEW.receipt_no <> OLD.receipt_no OR NEW.device_id <> OLD.device_id OR NEW.sales_order_id <> OLD.sales_order_id
           OR NEW.amount <> OLD.amount OR NEW.vat_amount <> OLD.vat_amount OR NEW.issued_at <> OLD.issued_at THEN
          RAISE EXCEPTION 'EFD receipt details cannot be changed. Void the receipt and record a new one.';
        END IF;
        IF OLD.status = 'VOIDED' AND NEW.status <> 'VOIDED' THEN RAISE EXCEPTION 'A voided EFD receipt cannot be reopened.'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await sql('DROP INDEX IF EXISTS efd_receipts_sale_id_idx');
    await sql('DROP INDEX IF EXISTS efd_receipts_sale_uq');
    await sql('ALTER TABLE efd_receipts DROP CONSTRAINT IF EXISTS efd_receipts_target_chk');
    await sql('ALTER TABLE efd_receipts DROP COLUMN IF EXISTS sale_id');   // receipts made only against a sale cannot go back: remove them first if any
  },
};
