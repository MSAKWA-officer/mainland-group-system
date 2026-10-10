const q = require('../services/saleQueries');
const svc = require('../services/cashSales');

const only = ['CASH'];
exports.list = async (req, res) => res.json(await q.list(req, only, req.query));
exports.getOne = async (req, res) => res.json(await q.fetch(req, req.params.id, only));
exports.create = async (req, res) => res.status(201).json(await q.fetch(req, (await svc.create(req, req.body)).id, only));
exports.void = async (req, res) => {
  await q.fetch(req, req.params.id, only);                                 // 404 if it is not yours to see
  res.json(await q.fetch(req, (await svc.void(req, req.params.id, req.body.reason)).id, only));
};
