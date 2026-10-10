const svc = require('../services/customerReports');

exports.list = async (req, res) => res.json(await svc.ageing(req, req.query));
exports.getOne = async (req, res) => res.json(await svc.ageingDetail(req, req.params.customerId, req.query.asOf));
