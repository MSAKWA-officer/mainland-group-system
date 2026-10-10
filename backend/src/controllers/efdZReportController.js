const svc = require('../services/efdZReports');

exports.list = async (req, res) => res.json(await svc.list(req, req.query));
exports.getOne = async (req, res) => res.json(await svc.getOne(req, req.params.id));
exports.create = async (req, res) => res.status(201).json(await svc.getOne(req, await svc.create(req, req.body)));
exports.update = async (req, res) => res.json(await svc.getOne(req, await svc.update(req, req.params.id, req.body)));
exports.verify = async (req, res) => res.json(await svc.getOne(req, await svc.verify(req, req.params.id, req.body.note)));
exports.reject = async (req, res) => res.json(await svc.getOne(req, await svc.reject(req, req.params.id, req.body.note)));
exports.void = async (req, res) => res.json(await svc.getOne(req, await svc.void(req, req.params.id, req.body.reason)));
