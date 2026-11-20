'use strict';

const router = require('express').Router();
const controller = require('../controllers/feed.controller');
const validators = require('../validators/community.validators');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
router.get('/stats', controller.stats); // Aggregate landing-page numbers are public.
router.get('/map', authenticate, validate(validators.listMap), controller.map);
router.get('/', authenticate, validate(validators.listFeed), controller.list);
module.exports = router;
