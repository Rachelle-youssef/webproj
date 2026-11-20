'use strict';

const router = require('express').Router();
const { body, query } = require('express-validator');
const controller = require('../controllers/medicineRequests.controller');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { listRules } = require('../validators/common.validators');
const { idOnly } = require('../validators/community.validators');
router.use(authenticate);
router.get(
  '/',
  requireRole('recipient', 'hospital', 'admin'),
  validate([
    query('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled']),
    ...listRules(['created_at'])
  ]),
  controller.list
);
router.post(
  '/',
  requireRole('recipient', 'hospital'),
  validate([
    body('medicine_id')
      .isInt({
        min: 1,
        max: 4294967295
      })
      .toInt(),
    body('quantity')
      .isInt({
        min: 1,
        max: 10000
      })
      .toInt()
  ]),
  controller.submit
);
router.patch(
  '/:id/dispense',
  requireRole('admin'),
  validate(idOnly),
  controller.dispense
);
module.exports = router;
