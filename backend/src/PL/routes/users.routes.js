// PL routes: /api/v1/users
'use strict';

const { Router } = require('express');
const controller = require('../controllers/users.controller');
const rules = require('../validators/users.validators');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const router = Router();
router.use(authenticate); // every /users endpoint needs a signed-in user

// Any signed-in user, about their own account
router.patch('/me', validate(rules.updateProfile), controller.updateMe);
router.patch('/me/password', validate(rules.changePassword), controller.changeMyPassword);

// Admins only
router.get('/', requireRole('admin'), validate(rules.listUsers), controller.list);
router.get('/:id', requireRole('admin'), validate(rules.userId), controller.getOne);
router.patch(
  '/:id/status',
  requireRole('admin'),
  validate(rules.setStatus),
  controller.setStatus
);
module.exports = router;
