const svc = require('../services/customerReports');

exports.list = async (req, res) => res.json(await svc.payments(req, req.query));
exports.getOne = async (req, res) => res.json(await svc.paymentOne(req, req.params.id));
