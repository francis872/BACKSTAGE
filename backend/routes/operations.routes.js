const express = require('express');
const controller = require('../controllers/operations.controller');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/health', controller.health);
router.get('/metrics', controller.operationalMetrics);
router.get('/analysis/:id/diagnostics', controller.diagnostics);

module.exports = router;
