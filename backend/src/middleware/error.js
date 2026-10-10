const { AppError } = require('../utils/errors');
const send = (res, s, code, message, details) => res.status(s).json({ error: { code, message, details } });
module.exports = {
  notFound: (req, res) => send(res, 404, 'NOT_FOUND', 'Route not found'),
  errorHandler: (err, req, res, next) => { // eslint-disable-line
    if (err instanceof AppError) return send(res, err.status, err.code, err.message, err.details);
    if (err.name === 'SequelizeUniqueConstraintError')
      return send(res, 409, 'DUPLICATE', 'That value is already in use', err.errors.map((e) => ({ field: e.path, message: 'Already in use' })));
    if (err.name === 'SequelizeForeignKeyConstraintError')
      return send(res, 409, 'IN_USE', 'This record is used by other records and cannot be removed');
    if (err.code === 'LIMIT_FILE_SIZE') return send(res, 413, 'FILE_TOO_LARGE', 'Files can be at most 5 MB');
    if (err.type === 'entity.parse.failed') return send(res, 400, 'BAD_JSON', 'Request body is not valid JSON');
    console.error(err); // details stay in the server log, never in the response
    return send(res, 500, 'INTERNAL', 'Something went wrong on our side');
  },
};
