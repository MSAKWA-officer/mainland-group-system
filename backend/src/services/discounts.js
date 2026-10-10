const { sequelize } = require('../models');

// Today's date as the database sees it (YYYY-MM-DD), so every check uses one clock.
const today = async (t) => (await sequelize.query("SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d", { transaction: t }))[0][0].d;

/* The single rule for "may this discount be used on this order line?".
   Returns an error message, or null when the discount can be applied. Used when a line is saved,
   when the order is submitted, and by the "available discounts" lookup. */
const check = (d, item, customerId, quantity, day) => {
  if (!d) return 'Discount not found';
  if (!d.isActive) return `Discount ${d.code} is not active`;
  if (d.validFrom > day) return `Discount ${d.code} is not valid until ${d.validFrom}`;
  if (d.validTo && d.validTo < day) return `Discount ${d.code} expired on ${d.validTo}`;
  if (d.scope === 'ITEM' && d.itemId !== item.id) return `Discount ${d.code} does not apply to this item`;
  if (d.scope === 'CATEGORY' && d.categoryId !== item.categoryId) return `Discount ${d.code} does not apply to this item's category`;
  if (d.customerId && d.customerId !== customerId) return `Discount ${d.code} does not apply to this customer`;
  if (Number(quantity) < Number(d.minQuantity)) return `Discount ${d.code} needs a quantity of at least ${Number(d.minQuantity)}`;
  return null;
};
module.exports = { today, check };
