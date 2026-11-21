// PL routes: public reference data (no sign-in needed: the sign-up form uses it).
'use strict';

const { Router } = require('express');
const controller = require('../controllers/reference.controller');
const { query } = require('express-validator');
const { validate } = require('../middleware/validate');
const { limiter } = require('../middleware/security');
const router = Router();
router.get('/blood-types', controller.bloodTypes);
router.get(
  '/hospital-locations',
  limiter({
    windowMinutes: 1,
    max: 15,
    message: 'Too many hospital searches. Wait a minute and try again.'
  }),
  validate([
    query('name').isString().bail().trim().isLength({ min: 2, max: 120 }),
    query('city').isString().bail().trim().isLength({ min: 2, max: 60 })
  ]),
  controller.hospitalLocations
);
module.exports = router;
