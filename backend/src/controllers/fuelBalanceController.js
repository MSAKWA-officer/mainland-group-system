const svc = require('../services/fuelBalances');

exports.list = async (req, res) => res.json(await svc.list(req, req.query));
exports.summary = async (req, res) => res.json(await svc.summary(req, req.query));
exports.getOne = async (req, res) => res.json(await svc.getOne(req, req.params.id));
