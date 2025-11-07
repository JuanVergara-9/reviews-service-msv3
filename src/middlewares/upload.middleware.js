'use strict';

const multer = require('multer');

// Memory storage: we will stream buffer to Cloudinary from controller
const storage = multer.memoryStorage();

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function fileFilter(_req, file, cb) {
  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    const err = new Error('Tipo de archivo no permitido');
    err.status = 400;
    return cb(err);
  }
  cb(null, true);
}

const uploadImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  }
});

// Para múltiples archivos (fotos de reseñas)
const uploadMultipleImages = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB por archivo
    files: 6 // Máximo 6 fotos
  }
});

module.exports = { uploadImage, uploadMultipleImages };

