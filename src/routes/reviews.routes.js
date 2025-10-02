const router=require('express').Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/reviews.controller');

// Reviews
router.post('/reviews', requireAuth, ctrl.create);
router.get('/providers/:id/reviews', ctrl.listProvider);
router.get('/providers/:id/review-summary', ctrl.summary);

module.exports = router;
