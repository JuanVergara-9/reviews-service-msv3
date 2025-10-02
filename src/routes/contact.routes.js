const router=require('express').Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/contact.controller');

router.post('/contact-intents', requireAuth, ctrl.create);
router.patch('/contact-intents/:id/responded', requireAuth, ctrl.responded);

module.exports = router;
