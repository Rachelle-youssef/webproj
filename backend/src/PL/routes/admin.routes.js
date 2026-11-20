'use strict';

const router = require('express').Router();
const controller = require('../controllers/admin.controller');
const validators = require('../validators/community.validators');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
router.use(authenticate, requireRole('admin'));
router.get('/stats', controller.stats);
router.get('/audit-logs', validate(validators.listAudit), controller.audit);
module.exports = router;
