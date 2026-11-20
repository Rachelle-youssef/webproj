// PL: registers every group of routes under /api/v1.
// Each later step adds one line here, for example:
//   router.use('/medicines', require('./medicines.routes'));
'use strict';

const { Router } = require('express');
const router = Router();
router.use(require('./health.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/users', require('./users.routes'));
router.use(require('./reference.routes'));
router.use('/blood-requests', require('./bloodRequests.routes'));
router.use('/blood-donations', require('./bloodDonations.routes'));
router.use('/blood-stock', require('./bloodStock.routes'));
router.use('/medicines', require('./medicines.routes'));
router.use('/medicine-requests', require('./medicineRequests.routes'));
router.use('/calls', require('./calls.routes'));
router.use('/notifications', require('./notifications.routes'));
router.use('/feed', require('./feed.routes'));
router.use('/admin', require('./admin.routes'));
module.exports = router;
