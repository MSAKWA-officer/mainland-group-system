const svc = require('../services/customerPayments');

exports.list = async (req, res) => res.json(await svc.list(req, req.query));
exports.getOne = async (req, res) => res.json(await svc.getOne(req, req.params.id));
exports.openSales = async (req, res) => res.json(await svc.openSales(req, req.params.customerId));
exports.create = async (req, res) => res.status(201).json(await svc.getOne(req, await svc.create(req, req.body)));
exports.void = async (req, res) => res.json(await svc.getOne(req, await svc.void(req, req.params.id, req.body.reason)));
