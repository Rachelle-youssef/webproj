// PL routes: /api/v1/blood-stock
'use strict';

const { Router } = require('express');
const controller = require('../controllers/bloodStock.controller');
const rules = require('../validators/blood.validators');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const router = Router();
router.use(authenticate);
router.get('/', requireRole('admin', 'hospital'), controller.levels);
router.get(
  '/movements',
  requireRole('admin'),
  validate(rules.listMovements),
  controller.movements
);
router.post(
  '/adjustments',
  requireRole('admin'),
  validate(rules.adjustStock),
  controller.adjust
);
module.exports = router;
