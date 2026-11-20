'use strict';

const router = require('express').Router();
const controller = require('../controllers/notifications.controller');
const validators = require('../validators/community.validators');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
router.use(authenticate);
router.get('/', validate(validators.listNotifications), controller.list);
router.get('/unread-count', controller.count);
router.patch('/read-all', controller.readAll);
router.patch('/:id/read', validate(validators.idOnly), controller.markRead);
module.exports = router;
