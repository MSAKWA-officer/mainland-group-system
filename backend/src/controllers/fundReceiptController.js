const svc = require('../services/fundReceipts');

exports.list = async (req, res) => res.json(await svc.list(req.query));
exports.summary = async (req, res) => res.json(await svc.summary(req.query));
exports.getOne = async (req, res) => res.json(await svc.getOne(req.params.id));
exports.create = async (req, res) => res.status(201).json(await svc.getOne(await svc.create(req, req.body)));
exports.void = async (req, res) => res.json(await svc.getOne(await svc.void(req, req.params.id, req.body.reason)));
