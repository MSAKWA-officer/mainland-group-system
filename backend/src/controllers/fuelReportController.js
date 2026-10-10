const svc = require('../services/fuelReports');

exports.consumption = async (req, res) => res.json(await svc.consumption(req.query));
exports.reconciliation = async (req, res) => res.json(await svc.reconciliation(req.query));
exports.monthly = async (req, res) => res.json(await svc.monthly(req.query));
