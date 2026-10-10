const { Salesperson } = require('../models');

/* "Own records" rule used by customers and sales orders.
   A user holding the `*.read_all` permission (Owner, Manager) sees everything.
   Everyone else (e.g. a Sales Person) only sees records that belong to their own salesperson profile,
   i.e. the salespersons row whose user_id is their login. No profile = no records. */
const NONE = '00000000-0000-0000-0000-000000000000';

const mine = async (req) => {
  if (req._salesperson === undefined) req._salesperson = await Salesperson.findOne({ where: { userId: req.user.id } });
  return req._salesperson;
};
const canAll = (req, perm) => req.user.permissions.has(perm);
// Adds the ownership filter to a Sequelize `where` for users without the read_all permission.
const scope = async (req, perm, where = {}, field = 'salespersonId') => {
  if (canAll(req, perm)) return where;
  const sp = await mine(req);
  return { ...where, [field]: sp ? sp.id : NONE };
};
// True when this user may see a record owned by `salespersonId`.
const canSee = async (req, perm, salespersonId) => {
  if (canAll(req, perm)) return true;
  const sp = await mine(req);
  return !!sp && sp.id === salespersonId;
};
module.exports = { mine, canAll, scope, canSee };
