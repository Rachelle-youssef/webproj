// PL routes: public reference data (no sign-in needed: the sign-up form uses it).
'use strict';

const { Router } = require('express');
const controller = require('../controllers/reference.controller');
const router = Router();
router.get('/blood-types', controller.bloodTypes);
module.exports = router;
