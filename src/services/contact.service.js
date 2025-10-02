const { ContactIntent } = require('../../models');
const dayjs = require('dayjs');

function clientIp(req){ return (req.headers['x-forwarded-for']||'').split(',')[0] || req.ip || null; }

async function createContactIntent(userId, { providerId, channel, messagePreview }, req){
  const ci = await ContactIntent.create({
    user_id: userId,
    provider_id: providerId,
    channel,
    message_preview: messagePreview,
    ip: clientIp(req),
    device: req.headers['user-agent'] || null
  });
  return ci;
}

async function markResponded(id){
  const ci = await ContactIntent.findByPk(id);
  if (!ci) return null;
  await ci.update({ provider_responded_at: new Date() });
  return ci;
}

async function existsRecentContact(userId, providerId, days=30){
  const since = dayjs().subtract(days, 'day').toDate();
  const count = await ContactIntent.count({ where: { user_id: userId, provider_id: providerId, created_at: { [require('sequelize').Op.gte]: since } } });
  return count > 0;
}

module.exports = { createContactIntent, markResponded, existsRecentContact };
