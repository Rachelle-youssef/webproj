// PL routes: /api/v1/auth
'use strict';

const { Router } = require('express');
const controller = require('../controllers/auth.controller');
const rules = require('../validators/auth.validators');
const config = require('../../config');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { limiter } = require('../middleware/security');

// Stricter limit on the two forms attackers target: password guessing and mass sign-ups.
const authLimiter = limiter({
  windowMinutes: 15,
  max: config.rateLimit.authMax,
  message: 'Too many attempts. Please wait 15 minutes and try again.'
});
const router = Router();
router.post('/register', authLimiter, validate(rules.register), controller.register);
router.post('/login', authLimiter, validate(rules.login), controller.login);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);
module.exports = router;
