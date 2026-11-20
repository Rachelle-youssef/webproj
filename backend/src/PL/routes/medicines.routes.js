'use strict';

const router = require('express').Router();
const { body, query } = require('express-validator');
const controller = require('../controllers/medicines.controller');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { idOnly } = require('../validators/community.validators');
const { listRules } = require('../validators/common.validators');
router.use(authenticate);
router.get('/categories', controller.categories);
router.get(
  '/',
  requireRole('admin', 'donor'),
  validate([
    query('status')
      .optional()
      .isIn(['pending', 'approved', 'rejected', 'expired', 'dispensed']),
    ...listRules(['created_at'])
  ]),
  controller.list
);
router.post(
  '/',
  requireRole('donor'),
  validate([
    body('name').isString().bail().trim().isLength({
      min: 2,
      max: 120
    }),
    body('category_id')
      .isInt({
        min: 1,
        max: 255
      })
      .toInt(),
    body('quantity_donated')
      .isInt({
        min: 1,
        max: 10000
      })
      .toInt(),
    body('expiry_date')
      .isString()
      .bail()
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .bail()
      .isISO8601({
        strict: true
      }),
    body('call_id')
      .optional({
        values: 'null'
      })
      .isInt({
        min: 1,
        max: 4294967295
      })
      .toInt(),
    body('description')
      .optional({
        values: 'null'
      })
      .isString()
      .bail()
      .trim()
      .isLength({
        max: 500
      }),
    body('photo_url')
      .optional({
        values: 'null'
      })
      .isString()
      .bail()
      .isLength({
        max: 500
      })
      .isURL({
        protocols: ['https', 'http'],
        require_protocol: true,
        disallow_auth: true
      })
  ]),
  controller.submit
);
router.patch(
  '/:id/review',
  requireRole('admin'),
  validate([
    ...idOnly,
    body('decision').isIn(['approve', 'reject']),
    body('note')
      .optional({
        values: 'null'
      })
      .isString()
      .bail()
      .trim()
      .isLength({
        max: 255
      }),
    body('note').if(body('decision').equals('reject')).isString().bail().trim().isLength({
      min: 3,
      max: 255
    })
  ]),
  controller.review
);
router.get(
  '/available',
  requireRole('recipient', 'hospital', 'admin'),
  validate(listRules(['expiry_date'])),
  controller.available
);
router.get('/:id', requireRole('admin'), validate(idOnly), controller.get);
router.get('/:id/qr', requireRole('admin'), validate(idOnly), controller.qr);
module.exports = router;
