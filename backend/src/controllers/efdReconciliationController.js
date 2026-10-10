const svc = require('../services/efdReconciliations');

exports.list = async (req, res) => res.json(await svc.list(req, req.query));
exports.preview = async (req, res) => res.json(await svc.preview(req, req.query));
exports.getOne = async (req, res) => res.json(await svc.getOne(req, req.params.id));
exports.create = async (req, res) => res.status(201).json(await svc.getOne(req, await svc.create(req, req.body)));
exports.refresh = async (req, res) => res.json(await svc.getOne(req, await svc.refresh(req, req.params.id)));
exports.reconcile = async (req, res) => res.json(await svc.getOne(req, await svc.reconcile(req, req.params.id, req.body.explanation)));
exports.void = async (req, res) => res.json(await svc.getOne(req, await svc.void(req, req.params.id, req.body.reason)));
