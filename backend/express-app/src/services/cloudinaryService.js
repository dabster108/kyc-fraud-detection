const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET_KEY,
});

/**
 * Upload an image buffer to Cloudinary.
 * Returns the secure_url of the uploaded image.
 *
 * @param {Buffer} buffer - Raw image bytes
 * @param {object} opts
 * @param {string} opts.folder - Cloudinary folder path
 * @param {string} [opts.publicId] - Optional explicit public_id
 * @returns {Promise<string>} secure_url
 */
function uploadBuffer(buffer, { folder = "kyc", publicId } = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      folder,
      resource_type: "image",
      ...(publicId ? { public_id: publicId } : {}),
    };

    const stream = cloudinary.uploader.upload_stream(opts, (error, result) => {
      if (error) {
        reject(new Error(`Cloudinary upload failed: ${error.message}`));
      } else {
        resolve(result.secure_url);
      }
    });

    stream.end(buffer);
  });
}

module.exports = { uploadBuffer };
