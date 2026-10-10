const { AppError } = require('../utils/errors');
// Input validation with zod. Parsed (trimmed / coerced / stripped) data replaces the raw input.
module.exports = (schema, src = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[src]);
  if (!r.success) return next(new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields',
    r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
  req[src] = r.data; next();
};
