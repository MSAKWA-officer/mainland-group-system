const svc = require('../services/efdDifferences');

exports.scan = async (req, res) => res.json(await svc.scan(req, req.query));
exports.types = async (req, res) => res.json({ types: svc.types(), severities: svc.SEVERITIES, maxDays: svc.MAX_DAYS });
