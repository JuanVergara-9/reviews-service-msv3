const { Review } = require('../../models');
const { existsRecentContact } = require('./contact.service');
const { forbidden, conflict, badRequest } = require('../utils/httpError');
const dayjs = require('dayjs');
const { Op, fn, col, literal, QueryTypes } = require('sequelize');

function clientIp(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || null; }

async function createReview(userId, payload, req) {
  const { providerId, rating, comment, photos } = payload;

  if (rating < 1 || rating > 5) throw badRequest('REVIEW.BAD_RATING', 'Rating 1..5');

  // 1) anti-spam: debe existir contact_intent en 30 días (gateado por env)
  const requireContactIntent = String(process.env.REVIEWS_REQUIRE_CONTACT_INTENT || 'true').toLowerCase() === 'true';
  if (requireContactIntent) {
    const hasContact = await existsRecentContact(userId, providerId, 30);
    if (!hasContact) throw forbidden('REVIEW.NO_CONTACT_INTENT', 'Necesitás haber contactado al proveedor (últimos 30 días)');
  }

  // 2) 1 reseña por user↔provider cada 30 días
  const since = dayjs().subtract(30, 'day').toDate();
  const exists = await Review.count({ where: { user_id: userId, provider_id: providerId, created_at: { [Op.gte]: since } } });
  if (exists > 0) throw conflict('REVIEW.WINDOW_LIMIT', 'Ya publicaste una reseña reciente para este proveedor');

  const r = await Review.create({
    user_id: userId,
    provider_id: providerId,
    rating,
    comment,
    photos: Array.isArray(photos) ? photos : [],
    ip: clientIp(req),
    user_agent: req.headers['user-agent'] || null
  });

  // Obtener información del usuario
  const sequelize = Review.sequelize;
  const userQuery = `
    SELECT 
      COALESCE(
        NULLIF(TRIM(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), ''),
        'Usuario'
      ) as user_name,
      up.avatar_url as user_avatar
    FROM user_profiles up
    WHERE up.user_id = :userId
    LIMIT 1
  `;

  const userRows = await sequelize.query(userQuery, {
    replacements: { userId },
    type: QueryTypes.SELECT
  });

  const userInfo = Array.isArray(userRows) && userRows.length > 0 ? userRows[0] : null;

  // Normalizar photos en la respuesta
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

  // Agregar información del usuario
  data.user_name = userInfo?.user_name || 'Usuario';
  data.user_avatar = userInfo?.user_avatar || null;

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

async function listProviderReviews(providerId, { limit = 20, offset = 0 }) {
  const sequelize = Review.sequelize;
  const limitNum = Math.min(Number(limit), 100);
  const offsetNum = Number(offset);

  console.log(`[listProviderReviews] Querying reviews for providerId: ${providerId}, limit: ${limitNum}, offset: ${offsetNum}`);

  // Primero verificar si la tabla user_profiles existe
  let hasUserProfilesTable = false;
  try {
    const checkTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_profiles'
      );
    `;
    const [tableCheck] = await sequelize.query(checkTableQuery, { type: QueryTypes.SELECT });
    hasUserProfilesTable = tableCheck?.exists === true;
    console.log(`[listProviderReviews] user_profiles table exists: ${hasUserProfilesTable}`);
  } catch (err) {
    console.warn(`[listProviderReviews] Error checking for user_profiles table:`, err.message);
    hasUserProfilesTable = false;
  }

  // Consulta con JOIN a user_profiles solo si la tabla existe
  let query;
  if (hasUserProfilesTable) {
    query = `
      SELECT 
        r.id,
        r.user_id,
        r.provider_id,
        r.rating,
        r.comment,
        r.photos,
        r.created_at,
        r.updated_at,
        COALESCE(
          NULLIF(TRIM(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), ''),
          NULLIF(TRIM(COALESCE(up.first_name, '')), ''),
          NULLIF(TRIM(COALESCE(up.last_name, '')), ''),
          'Usuario'
        ) as user_name,
        up.avatar_url as user_avatar
      FROM reviews r
      LEFT JOIN user_profiles up ON r.user_id = up.user_id
      WHERE r.provider_id = :providerId
      ORDER BY r.created_at DESC
      LIMIT :limit OFFSET :offset
    `;
  } else {
    // Consulta sin JOIN si la tabla no existe
    query = `
      SELECT 
        r.id,
        r.user_id,
        r.provider_id,
        r.rating,
        r.comment,
        r.photos,
        r.created_at,
        r.updated_at,
        'Usuario' as user_name,
        NULL as user_avatar
      FROM reviews r
      WHERE r.provider_id = :providerId
      ORDER BY r.created_at DESC
      LIMIT :limit OFFSET :offset
    `;
  }

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

  console.log(`[listProviderReviews] Raw query results - rows: ${rows?.length || 0}, countResult:`, countResult);

  const count = Number(countResult[0]?.count || 0);
  console.log(`[listProviderReviews] Total count: ${count}, rows returned: ${rows?.length || 0}`);

  // Función helper para obtener datos de usuario desde user-service si user_profiles está vacío
  async function getUserDataFromService(userId) {
    try {
      const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:4002';
      const response = await fetch(`${userServiceUrl}/api/v1/users/${userId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000) // Timeout de 3 segundos
      });

      if (response.ok) {
        const userData = await response.json();
        const profile = userData.profile || userData;
        const firstName = profile.first_name || '';
        const lastName = profile.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();
        return {
          user_name: fullName || 'Usuario',
          user_avatar: profile.avatar_url || null
        };
      }
    } catch (err) {
      console.warn(`[listProviderReviews] Error fetching user data from user-service for userId ${userId}:`, err.message);
    }
    return null;
  }

  // Normalizar photos a array y formatear datos, y obtener datos de usuarios si faltan
  const normalizedRows = await Promise.all(rows.map(async (row) => {
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

    // Si user_name está vacío o es 'Usuario', intentar obtener desde user-service
    // También verificar si el nombre es solo espacios en blanco
    const trimmedName = (data.user_name || '').trim();
    if (!trimmedName || trimmedName === '' || trimmedName === 'Usuario') {
      const userData = await getUserDataFromService(data.user_id);
      if (userData && userData.user_name && userData.user_name.trim() !== '' && userData.user_name.trim() !== 'Usuario') {
        data.user_name = userData.user_name.trim();
        data.user_avatar = userData.user_avatar;
      } else if (!trimmedName || trimmedName === '') {
        // Solo establecer 'Usuario' si realmente no hay nombre
        data.user_name = 'Usuario';
      }
    } else {
      // Asegurar que el nombre esté recortado
      data.user_name = trimmedName;
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
  }));

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

  // Obtener información del usuario para la respuesta
  const sequelize = Review.sequelize;
  let userInfo = null;

  // Intentar obtener desde user_profiles
  try {
    const checkTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_profiles'
      );
    `;
    const [tableCheck] = await sequelize.query(checkTableQuery, { type: QueryTypes.SELECT });
    const hasUserProfilesTable = tableCheck?.exists === true;

    if (hasUserProfilesTable) {
      const userQuery = `
        SELECT 
          COALESCE(
            NULLIF(TRIM(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), ''),
            'Usuario'
          ) as user_name,
          up.avatar_url as user_avatar
        FROM user_profiles up
        WHERE up.user_id = :userId
        LIMIT 1
      `;
      const userRows = await sequelize.query(userQuery, {
        replacements: { userId: review.user_id },
        type: QueryTypes.SELECT
      });
      userInfo = Array.isArray(userRows) && userRows.length > 0 ? userRows[0] : null;
    }
  } catch (err) {
    console.warn(`[updateReviewPhotos] Error checking user_profiles:`, err.message);
  }

  // Si no hay datos en user_profiles, intentar desde user-service
  if (!userInfo || !userInfo.user_name || userInfo.user_name === 'Usuario') {
    try {
      const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:4002';
      const response = await fetch(`${userServiceUrl}/api/v1/users/${review.user_id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        const userData = await response.json();
        const profile = userData.profile || userData;
        const firstName = profile.first_name || '';
        const lastName = profile.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();
        userInfo = {
          user_name: fullName || 'Usuario',
          user_avatar: profile.avatar_url || null
        };
      }
    } catch (err) {
      console.warn(`[updateReviewPhotos] Error fetching user data from user-service:`, err.message);
    }
  }

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

  // Agregar información del usuario
  data.user_name = userInfo?.user_name || 'Usuario';
  data.user_avatar = userInfo?.user_avatar || null;

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
    // Fallback para SQLite u otros (asumiendo que photos se guarda como string JSON)
    // Esto es una aproximación, ya que SQLite no tiene jsonb_array_length nativo igual
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

  // Verificar si la tabla user_profiles existe
  let hasUserProfilesTable = false;
  try {
    const checkTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_profiles'
      );
    `;
    const [tableCheck] = await sequelize.query(checkTableQuery, { type: QueryTypes.SELECT });
    hasUserProfilesTable = tableCheck?.exists === true;
  } catch (err) {
    console.warn(`[getRecentReviews] Error checking for user_profiles table:`, err.message);
    hasUserProfilesTable = false;
  }

  // Consulta con JOIN a user_profiles solo si la tabla existe
  let query;
  if (hasUserProfilesTable) {
    query = `
      SELECT 
        r.id,
        r.user_id,
        r.provider_id,
        r.rating,
        r.comment,
        r.photos,
        r.created_at,
        COALESCE(
          NULLIF(TRIM(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), ''),
          'Usuario'
        ) as user_name,
        up.avatar_url as user_avatar
      FROM reviews r
      LEFT JOIN user_profiles up ON r.user_id = up.user_id
      ORDER BY r.created_at DESC
      LIMIT :limit
    `;
  } else {
    query = `
      SELECT 
        r.id,
        r.user_id,
        r.provider_id,
        r.rating,
        r.comment,
        r.photos,
        r.created_at,
        'Usuario' as user_name,
        NULL as user_avatar
      FROM reviews r
      ORDER BY r.created_at DESC
      LIMIT :limit
    `;
  }

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

