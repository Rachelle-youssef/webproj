// PL routes: /api/v1/blood-requests
'use strict';

const { Router } = require('express');
const controller = require('../controllers/bloodRequests.controller');
const rules = require('../validators/blood.validators');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const router = Router();
router.use(authenticate);
router.post(
  '/',
  requireRole('recipient', 'hospital'),
  validate(rules.createRequest),
  controller.create
);
router.get('/', validate(rules.listRequests), controller.list);
router.get('/:id', validate(rules.idOnly), controller.getOne);
router.patch(
  '/:id/cancel',
  requireRole('recipient', 'hospital', 'admin'),
  validate(rules.cancelRequest),
  controller.cancel
);
router.patch(
  '/:id/location',
  requireRole('recipient', 'hospital', 'admin'),
  validate(rules.updateLocation),
  controller.updateLocation
);

// Admins only
router.patch(
  '/:id/review',
  requireRole('admin'),
  validate(rules.review),
  controller.review
);
router.get(
  '/:id/matches',
  requireRole('admin'),
  validate(rules.matches),
  controller.matches
);
router.post(
  '/:id/invitations',
  requireRole('admin'),
  validate(rules.invite),
  controller.invite
);
router.post(
  '/:id/dispense',
  requireRole('admin'),
  validate(rules.dispense),
  controller.dispense
);
module.exports = router;
