const { Review } = require('../../models');
const { existsRecentContact } = require('./contact.service');
const { forbidden, conflict, badRequest } = require('../utils/httpError');
const dayjs = require('dayjs');
const { Op, fn, col, literal } = require('sequelize');

function clientIp(req){ return (req.headers['x-forwarded-for']||'').split(',')[0] || req.ip || null; }

async function createReview(userId, payload, req){
  const { providerId, rating, comment, photos } = payload;

  if (rating < 1 || rating > 5) throw badRequest('REVIEW.BAD_RATING','Rating 1..5');

  // 1) anti-spam: debe existir contact_intent en 30 días (gateado por env)
  const requireContactIntent = String(process.env.REVIEWS_REQUIRE_CONTACT_INTENT || 'true').toLowerCase() === 'true';
  if (requireContactIntent) {
    const hasContact = await existsRecentContact(userId, providerId, 30);
    if (!hasContact) throw forbidden('REVIEW.NO_CONTACT_INTENT','Necesitás haber contactado al proveedor (últimos 30 días)');
  }

  // 2) 1 reseña por user↔provider cada 30 días
  const since = dayjs().subtract(30,'day').toDate();
  const exists = await Review.count({ where: { user_id: userId, provider_id: providerId, created_at: { [Op.gte]: since } } });
  if (exists > 0) throw conflict('REVIEW.WINDOW_LIMIT','Ya publicaste una reseña reciente para este proveedor');

  const r = await Review.create({
    user_id: userId,
    provider_id: providerId,
    rating,
    comment,
    photos: Array.isArray(photos) ? photos : [],
    ip: clientIp(req),
    user_agent: req.headers['user-agent'] || null
  });
  return r;
}

async function listProviderReviews(providerId, { limit=20, offset=0 }){
  return Review.findAndCountAll({
    where: { provider_id: providerId },
    order: [['created_at','DESC']],
    limit: Math.min(Number(limit), 100),
    offset: Number(offset)
  });
}

async function providerReviewSummary(providerId){
  const since90 = dayjs().subtract(90,'day').toDate();
  const [row] = await Review.findAll({
    where: { provider_id: providerId, created_at: { [Op.gte]: since90 } },
    attributes: [
      [fn('COUNT', col('id')), 'count'],
      [fn('AVG', col('rating')), 'avg'],
      [fn('SUM', literal("CASE WHEN jsonb_array_length(photos) > 0 THEN 1 ELSE 0 END")), 'withPhotos']
    ],
    raw: true
  });
  return {
    count: Number(row?.count || 0),
    avgRating: row?.avg ? Number(parseFloat(row.avg).toFixed(1)) : 0,
    photosRate: row?.count ? Number(((Number(row.withPhotos||0) / Number(row.count)) * 100).toFixed(0)) : 0
  };
}

module.exports = { createReview, listProviderReviews, providerReviewSummary };
