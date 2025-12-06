const { Review } = require('../../models');
const { existsRecentContact } = require('./contact.service');
const { forbidden, conflict, badRequest } = require('../utils/httpError');
const dayjs = require('dayjs');
const { Op, fn, col, literal, QueryTypes } = require('sequelize');

function clientIp(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || null; }

// ✅ A. Función auxiliar modificada para aceptar token
async function getUserDataFromService(userId, token = null) {
  try {
    const gatewayUrl = process.env.GATEWAY_URL || process.env.API_GATEWAY_URL || process.env.USER_SERVICE_URL || 'http://localhost:4002';
    const baseUrl = gatewayUrl.includes('users') ? gatewayUrl : `${gatewayUrl}/api/v1/users`;

    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = token; // ✅ Inyectamos el token
    }

    const response = await fetch(`${baseUrl}/${userId}`, {
      method: 'GET',
      headers: headers,
      signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
      const userData = await response.json();
      const profile = userData.profile || userData;
      const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
      return {
        user_name: fullName || 'Usuario',
        user_avatar: profile.avatar_url || null
      };
    }
  } catch (err) {
    console.warn(`[getUserData] Error fetching user ${userId}:`, err.message);
  }
  return null;
}

// ✅ B. Función createReview modificada para obtener y guardar datos
async function createReview(userId, payload, req) {
  const { providerId, rating, comment, photos } = payload;

  if (rating < 1 || rating > 5) throw badRequest('REVIEW.BAD_RATING', 'Rating 1..5');

  // 1) anti-spam: debe existir contact_intent en 30 días
  const requireContactIntent = String(process.env.REVIEWS_REQUIRE_CONTACT_INTENT || 'true').toLowerCase() === 'true';
  if (requireContactIntent) {
    const hasContact = await existsRecentContact(userId, providerId, 30);
    if (!hasContact) throw forbidden('REVIEW.NO_CONTACT_INTENT', 'Necesitás haber contactado al proveedor (últimos 30 días)');
  }

  // 2) 1 reseña por user↔provider cada 30 días
  const since = dayjs().subtract(30, 'day').toDate();
  const exists = await Review.count({ where: { user_id: userId, provider_id: providerId, created_at: { [Op.gte]: since } } });
  if (exists > 0) throw conflict('REVIEW.WINDOW_LIMIT', 'Ya publicaste una reseña reciente para este proveedor');

  // ✅ 1. Obtener el token de la petición actual
  const token = req.headers.authorization;

  // ✅ 2. Intentar obtener datos del usuario USANDO EL TOKEN
  let userInfo = { user_name: 'Usuario', user_avatar: null };
  
  const fetchedUser = await getUserDataFromService(userId, token);
  if (fetchedUser) {
    userInfo = fetchedUser;
  }

  // ✅ 3. Crear la reseña guardando también el nombre y avatar
  const r = await Review.create({
    user_id: userId,
    provider_id: providerId,
    rating,
    comment,
    photos: Array.isArray(photos) ? photos : [],
    ip: clientIp(req),
    user_agent: req.headers['user-agent'] || null,
    
    // ✅ Guardamos los datos desnormalizados:
    user_name: userInfo.user_name,
    user_avatar: userInfo.user_avatar
  });

  // Normalizar response
  const data = r.toJSON ? r.toJSON() : r;
  if (data.photos && !Array.isArray(data.photos)) {
    try {
      data.photos = JSON.parse(data.photos);
    } catch {
      data.photos = [];
    }
  }
  if (!data.photos || !Array.isArray(data.photos)) {
    data.photos = [];
  }

  // Asegurar formato ISO para created_at
  if (data.created_at) {
    try {
      const date = new Date(data.created_at);
      data.created_at = date.toISOString();
    } catch {
      // Mantener el valor original si falla
    }
  }

  return data;
}

// ✅ C. Función listProviderReviews simplificada
async function listProviderReviews(providerId, { limit = 20, offset = 0 }) {
  const sequelize = Review.sequelize;
  const limitNum = Math.min(Number(limit), 100);
  const offsetNum = Number(offset);

  console.log(`[listProviderReviews] Querying reviews for providerId: ${providerId}, limit: ${limitNum}, offset: ${offsetNum}`);

  // ✅ Query simplificada - leemos user_name y user_avatar directos de la tabla
  const query = `
    SELECT 
      r.id,
      r.user_id,
      r.provider_id,
      r.rating,
      r.comment,
      r.photos,
      r.created_at,
      r.updated_at,
      r.user_name,    -- ✅ Leemos directo de la tabla reviews
      r.user_avatar   -- ✅ Leemos directo de la tabla reviews
    FROM reviews r
    WHERE r.provider_id = :providerId
    ORDER BY r.created_at DESC
    LIMIT :limit OFFSET :offset
  `;

  const countQuery = `
    SELECT COUNT(*) as count
    FROM reviews
    WHERE provider_id = :providerId
  `;

  console.log(`[listProviderReviews] Executing count query for providerId: ${providerId}`);

  const [rows, countResult] = await Promise.all([
    sequelize.query(query, {
      replacements: { providerId, limit: limitNum, offset: offsetNum },
      type: QueryTypes.SELECT
    }),
    sequelize.query(countQuery, {
      replacements: { providerId },
      type: QueryTypes.SELECT
    })
  ]);

  const count = Number(countResult[0]?.count || 0);
  console.log(`[listProviderReviews] Total count: ${count}, rows returned: ${rows?.length || 0}`);

  // ✅ Mapeo simplificado - solo formatear photos y fechas
  const normalizedRows = rows.map((row) => {
    const data = { ...row };

    // Asegurar que photos sea siempre un array
    if (data.photos) {
      if (typeof data.photos === 'string') {
        try {
          data.photos = JSON.parse(data.photos);
        } catch {
          data.photos = [];
        }
      } else if (!Array.isArray(data.photos)) {
        data.photos = [];
      }
    } else {
      data.photos = [];
    }

    // Asegurar que user_name no esté vacío
    if (!data.user_name || data.user_name.trim() === '') {
      data.user_name = 'Usuario';
    }

    // Asegurar que created_at esté en formato ISO string
    if (data.created_at) {
      try {
        const date = new Date(data.created_at);
        data.created_at = date.toISOString();
      } catch {
        // Mantener el valor original si falla
      }
    }

    return data;
  });

  return {
    count,
    rows: normalizedRows
  };
}

async function updateReviewPhotos(reviewId, userId, userRole, newPhotos) {
  const review = await Review.findByPk(reviewId);

  if (!review) {
    throw badRequest('REVIEW.NOT_FOUND', 'Reseña no encontrada');
  }

  // Verificar permisos: admin o dueño de la reseña
  const isAdmin = userRole === 'admin';
  const isOwner = review.user_id === userId;

  if (!isAdmin && !isOwner) {
    throw forbidden('REVIEW.FORBIDDEN', 'No tienes permiso para actualizar esta reseña');
  }

  await review.update({
    photos: Array.isArray(newPhotos) ? newPhotos : []
  });

  const data = review.toJSON();

  // Normalizar photos
  if (data.photos && !Array.isArray(data.photos)) {
    try {
      data.photos = JSON.parse(data.photos);
    } catch {
      data.photos = [];
    }
  }
  if (!data.photos || !Array.isArray(data.photos)) {
    data.photos = [];
  }

  // Asegurar que created_at esté en formato ISO string
  if (data.created_at) {
    try {
      const date = new Date(data.created_at);
      data.created_at = date.toISOString();
    } catch {
      // Mantener el valor original si falla
    }
  }

  return data;
}

async function providerReviewSummary(providerId) {
  const since90 = dayjs().subtract(90, 'day').toDate();
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
    photosRate: row?.count ? Number(((Number(row.withPhotos || 0) / Number(row.count)) * 100).toFixed(0)) : 0
  };
}

async function globalReviewSummary() {
  const since90 = dayjs().subtract(90, 'day').toDate();

  // Detectar si estamos usando SQLite (para pruebas locales) o Postgres
  const dialect = Review.sequelize.getDialect();
  const isPostgres = dialect === 'postgres';

  let withPhotosLiteral;
  if (isPostgres) {
    withPhotosLiteral = literal("CASE WHEN jsonb_array_length(photos) > 0 THEN 1 ELSE 0 END");
  } else {
    // Fallback para SQLite u otros
    withPhotosLiteral = literal("CASE WHEN photos != '[]' AND photos IS NOT NULL THEN 1 ELSE 0 END");
  }

  const [row] = await Review.findAll({
    where: { created_at: { [Op.gte]: since90 } },
    attributes: [
      [fn('COUNT', col('id')), 'count'],
      [fn('AVG', col('rating')), 'avg'],
      [fn('SUM', withPhotosLiteral), 'withPhotos']
    ],
    raw: true
  });

  return {
    count: Number(row?.count || 0),
    avgRating: row?.avg ? Number(parseFloat(row.avg).toFixed(1)) : 0,
    photosRate: row?.count ? Number(((Number(row.withPhotos || 0) / Number(row.count)) * 100).toFixed(0)) : 0
  };
}

async function getRecentReviews(limit = 3) {
  const sequelize = Review.sequelize;
  const limitNum = Math.min(Number(limit), 10);

  // ✅ Query simplificada - leemos user_name y user_avatar directos
  const query = `
    SELECT 
      r.id,
      r.user_id,
      r.provider_id,
      r.rating,
      r.comment,
      r.photos,
      r.created_at,
      r.user_name,    -- ✅ Leemos directo de la tabla
      r.user_avatar   -- ✅ Leemos directo de la tabla
    FROM reviews r
    ORDER BY r.created_at DESC
    LIMIT :limit
  `;

  const rows = await sequelize.query(query, {
    replacements: { limit: limitNum },
    type: QueryTypes.SELECT
  });

  // Normalizar photos a array y formatear datos
  const normalizedRows = rows.map((row) => {
    const data = { ...row };

    // Asegurar que photos sea siempre un array
    if (data.photos) {
      if (typeof data.photos === 'string') {
        try {
          data.photos = JSON.parse(data.photos);
        } catch {
          data.photos = [];
        }
      } else if (!Array.isArray(data.photos)) {
        data.photos = [];
      }
    } else {
      data.photos = [];
    }

    // Asegurar que user_name no esté vacío
    if (!data.user_name || data.user_name.trim() === '') {
      data.user_name = 'Usuario';
    }

    // Asegurar que created_at esté en formato ISO string
    if (data.created_at) {
      try {
        const date = new Date(data.created_at);
        data.created_at = date.toISOString();
      } catch {
        // Mantener el valor original si falla
      }
    }

    return data;
  });

  return normalizedRows;
}

module.exports = { createReview, listProviderReviews, providerReviewSummary, updateReviewPhotos, globalReviewSummary, getRecentReviews };