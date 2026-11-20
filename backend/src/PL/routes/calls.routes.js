'use strict';

const router = require('express').Router();
const controller = require('../controllers/calls.controller');
const validators = require('../validators/community.validators');
const blood = require('../validators/blood.validators');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
router.use(authenticate);
router.get('/', validate(validators.listCalls), controller.list);
router.post(
  '/medicine',
  requireRole('admin'),
  validate(validators.createMedicine),
  controller.createMedicine
);
router.post(
  '/blood',
  requireRole('admin'),
  validate(blood.createRequest),
  controller.createBlood
);
router.get('/:id', validate(validators.idOnly), controller.get);
router.patch(
  '/:id/close',
  requireRole('admin'),
  validate(validators.idOnly),
  controller.close
);
module.exports = router;
