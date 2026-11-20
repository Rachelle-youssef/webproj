// PL: which URL and HTTP method reaches which controller function.
'use strict';

const { Router } = require('express');
const controller = require('../controllers/health.controller');
const router = Router();
router.get('/health', controller.getHealth);
module.exports = router;
