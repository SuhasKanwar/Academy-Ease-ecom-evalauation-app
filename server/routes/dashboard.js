const express = require('express');

const router = express.Router();

const { getDashboardProductsHandler, getDashboardVisitorsHandler } = require('../controllers/dashboard_controller');

router.get('/products', getDashboardProductsHandler);
router.get('/visitors', getDashboardVisitorsHandler);

module.exports = router;