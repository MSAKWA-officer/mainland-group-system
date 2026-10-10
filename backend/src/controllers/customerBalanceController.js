const svc = require('../services/customerReports');

exports.list = async (req, res) => res.json(await svc.balances(req, req.query));
exports.getOne = async (req, res) => res.json(await svc.balanceDetail(req, req.params.customerId));
