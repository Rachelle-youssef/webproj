// PL routes: /api/v1/blood-donations
'use strict';

const { Router } = require('express');
const controller = require('../controllers/bloodDonations.controller');
const rules = require('../validators/blood.validators');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const router = Router();
router.use(authenticate);

// Donors
router.get('/eligibility', requireRole('donor'), controller.eligibility);
router.post('/', requireRole('donor'), validate(rules.offer), controller.offer);
router.patch(
  '/:id/respond',
  requireRole('donor'),
  validate(rules.respond),
  controller.respond
);
router.patch(
  '/:id/withdraw',
  requireRole('donor'),
  validate(rules.idOnly),
  controller.withdraw
);

// Donors (their own) and admins (all)
router.get(
  '/',
  requireRole('donor', 'admin'),
  validate(rules.listDonations),
  controller.list
);

// Admins
router.patch(
  '/:id/accept',
  requireRole('admin'),
  validate(rules.idOnly),
  controller.accept
);
router.patch(
  '/:id/confirm',
  requireRole('admin'),
  validate(rules.idOnly),
  controller.confirm
);
router.patch(
  '/:id/cancel',
  requireRole('admin'),
  validate(rules.cancelDonation),
  controller.cancel
);
module.exports = router;
