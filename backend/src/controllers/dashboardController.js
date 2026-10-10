const svc = require('../services/dashboardSummary');

// Optional ?module=<key> returns just that module (used by the Approvals page).
exports.summary = async (req, res) => res.json(await svc.summary(req, typeof req.query.module === 'string' ? req.query.module : undefined));
