'use strict';

const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary using env vars. Prefers CLOUDINARY_URL, falls back to discrete vars.
function configure() {
  const alreadyConfigured = cloudinary.config().cloud_name;
  if (alreadyConfigured) return cloudinary;

  if (process.env.CLOUDINARY_URL) {
    // When CLOUDINARY_URL is present, SDK reads it automatically. Force secure URLs.
    cloudinary.config({ secure: true });
  } else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });
  } else {
    console.warn('[Cloudinary] Missing configuration. Set CLOUDINARY_URL or individual credentials.');
  }
  return cloudinary;
}

const api = configure();

function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = api.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

async function destroy(publicId, options = {}) {
  return api.uploader.destroy(publicId, options);
}

module.exports = { cloudinary: api, uploadBuffer, destroy };

