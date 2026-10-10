const router = require('express').Router();
const { z, idParam, paging, bool, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/bankController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const swift = z.string().trim().regex(/^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/, 'A SWIFT / BIC code has 8 or 11 characters').transform((s) => s.toUpperCase());
const country = z.string().trim().regex(/^[A-Za-z]{2}$/, 'Use the 2-letter country code, e.g. TZ').transform((s) => s.toUpperCase());
const phone = text(30).regex(/^[0-9+()\s-]{6,30}$/, 'Enter a valid phone number');
const base = { name: text(120).min(2), shortName: opt(text(30)), swiftCode: opt(swift), country: country.default('TZ'), phone: opt(phone), website: opt(text(150)), notes: opt(text(255)) };
const createS = z.object(base);
const updateS = z.object({ ...base, country }).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ isActive: z.boolean(), reason: text(500).optional() });
const listQ = z.object({ search: text(80).optional(), isActive: bool.optional(), country: country.optional(), ...paging });

router.get('/', authorize('banks.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('banks.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('banks.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('banks.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.patch('/:id/status', authorize('banks.deactivate'), validate(idParam, 'params'), validate(statusS), ah(c.setStatus));
router.delete('/:id', authorize('banks.delete'), validate(idParam, 'params'), ah(c.remove));
module.exports = router;
