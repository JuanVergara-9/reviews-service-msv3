const { z } = require('zod');
const svc = require('../services/contact.service');
const { requireAuth } = require('../middlewares/auth.middleware');

const createSchema = z.object({
  providerId: z.number().int(),
  channel: z.enum(['whatsapp','form']),
  messagePreview: z.string().max(160).optional()
}).strict();

async function create(req,res,next){
  try{
    const data = createSchema.parse(req.body);
    const ci = await svc.createContactIntent(req.user.userId, data, req);
    res.status(201).json({ contactIntent: ci });
  } catch(e){ next(e); }
}

async function responded(req,res,next){
  try{
    const ci = await svc.markResponded(req.params.id);
    if (!ci) return res.status(404).json({ error:{ code: 'CONTACT_INTENT.NOT_FOUND', message: 'No existe' }});
    res.json({ contactIntent: ci });
  } catch(e){ next(e); }
}

module.exports = { create, responded };
