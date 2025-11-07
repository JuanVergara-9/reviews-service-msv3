const { z } = require('zod');
const svc = require('../services/reviews.service');

const createSchema = z.object({
  providerId: z.number().int(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  photos: z.array(z.string().url()).max(6).optional() // opcional
}).strict();

async function create(req,res,next){
  try{
    const data = createSchema.parse(req.body);
    const r = await svc.createReview(req.user.userId, data, req);
    res.status(201).json({ review: r });
  } catch(e){ next(e); }
}

async function listProvider(req,res,next){
  try{
    const providerId = Number(req.params.id);
    console.log(`[listProvider] Request for providerId: ${providerId}, query:`, req.query);
    const { count, rows } = await svc.listProviderReviews(providerId, { limit: req.query.limit, offset: req.query.offset });
    console.log(`[listProvider] Found ${count} reviews, returning ${rows.length} items`);
    res.json({ count, items: rows });
  } catch(e){ 
    console.error(`[listProvider] Error:`, e);
    next(e); 
  }
}

async function summary(req,res,next){
  try{
    const providerId = Number(req.params.id);
    const s = await svc.providerReviewSummary(providerId);
    res.json({ summary: s });
  } catch(e){ next(e); }
}

const updatePhotosSchema = z.object({
  photos: z.array(z.string().url()).max(6)
}).strict();

async function updatePhotos(req, res, next) {
  try {
    const reviewId = Number(req.params.id);
    const userId = req.user.userId;
    const userRole = req.user.role;
    const data = updatePhotosSchema.parse(req.body);
    const r = await svc.updateReviewPhotos(reviewId, userId, userRole, data.photos);
    res.status(200).json({ review: r });
  } catch(e) { next(e); }
}

module.exports = { create, listProvider, summary, updatePhotos };
