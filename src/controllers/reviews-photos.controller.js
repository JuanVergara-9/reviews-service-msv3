const { uploadBuffer } = require('../utils/cloudinary');

async function uploadReviewPhotos(req, res, next) {
  try {
    const userId = Number(req.user?.userId);
    if (!userId || isNaN(userId)) {
      return res.status(401).json({ error: { code: 'REVIEW.UNAUTHORIZED', message: 'No autorizado' } });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: { code: 'REVIEW.NO_FILES', message: 'Archivos requeridos (field: files)' } });
    }

    if (req.files.length > 6) {
      return res.status(400).json({ error: { code: 'REVIEW.TOO_MANY_FILES', message: 'Máximo 6 fotos' } });
    }

    const folder = process.env.CLOUDINARY_FOLDER || 'miservicio/reviews';
    const uploadPromises = req.files.map((file, index) => {
      const publicIdBase = `review_${userId}_${Date.now()}_${index}`;
      return uploadBuffer(file.buffer, {
        folder,
        public_id: publicIdBase,
        overwrite: false,
        resource_type: 'image'
      });
    });

    const uploadResults = await Promise.all(uploadPromises);

    const urls = uploadResults.map(result => ({
      url: result.secure_url || result.url,
      public_id: result.public_id
    }));

    res.status(200).json({ photos: urls });
  } catch (e) {
    next(e);
  }
}

module.exports = { uploadReviewPhotos };

