const { z } = require('zod');

// Shared zod building blocks for the inventory routes.
const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });
const paging = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};
const decimal = (dp) => z.coerce.number().refine(
  (n) => Number.isFinite(n) && Math.abs(n * 10 ** dp - Math.round(n * 10 ** dp)) < 1e-6, `At most ${dp} decimal places`);
const quantity = decimal(3).refine((n) => n > 0 && n <= 9999999999, 'Quantity must be greater than 0');
const quantity0 = decimal(3).refine((n) => n >= 0 && n <= 9999999999, 'Must be 0 or more');
const money = decimal(2).refine((n) => n >= 0 && n <= 999999999999, 'Amount must be 0 or more');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => {
  const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'Invalid date');
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const text = (max) => z.string().trim().max(max);
const like = (s) => `%${s.replace(/[%_\\]/g, '')}%`;   // safe ILIKE pattern

module.exports = { z, uuid, idParam, paging, decimal, quantity, quantity0, money, date, bool, text, like };
