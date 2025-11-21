const router = require('express').Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/reviews.controller');
const photosCtrl = require('../controllers/reviews-photos.controller');

let uploadMultipleImages;
try {
  const uploadMiddleware = require('../middlewares/upload.middleware');
  uploadMultipleImages = uploadMiddleware.uploadMultipleImages;
  console.log('[reviews.routes] uploadMultipleImages middleware loaded successfully');
} catch (error) {
  console.error('[reviews.routes] Error loading uploadMultipleImages middleware:', error);
  uploadMultipleImages = {
    array: () => (req, res, next) => {
      return res.status(500).json({
        error: { code: 'REVIEW.UPLOAD_MIDDLEWARE_ERROR', message: 'Upload middleware no disponible' }
      });
    }
  };
}

// Reviews
router.post('/reviews', requireAuth, ctrl.create);
router.post('/reviews/photos', requireAuth, uploadMultipleImages.array('files', 6), photosCtrl.uploadReviewPhotos);
router.put('/reviews/:id/photos', requireAuth, ctrl.updatePhotos);
router.get('/providers/:id/reviews', ctrl.listProvider);
router.get('/providers/:id/review-summary', ctrl.summary);
router.get('/reviews/stats/summary', ctrl.globalSummary);
router.get('/reviews/recent', ctrl.recentReviews);

module.exports = router;

