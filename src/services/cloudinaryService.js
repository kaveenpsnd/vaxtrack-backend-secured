import cloudinary from "../config/cloudinary.js";

/**
 * Upload an image buffer to Cloudinary
 * @param {Buffer} fileBuffer - The image file buffer from multer
 * @param {string} folder - The folder name in Cloudinary (default: vaxtrack/vaccines)
 * @returns {Promise<string>} - The secure URL of the uploaded image
 */
export const uploadImage = (fileBuffer, folder = "vaxtrack/vaccines") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) {
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else {
          resolve(result.secure_url);
        }
      },
    );
    stream.end(fileBuffer);
  });
};

/**
 * Delete an image from Cloudinary using its secure URL
 * @param {string} imageUrl - The secure URL of the image to delete
 * @returns {Promise<any>}
 */
export const deleteImage = async (imageUrl) => {
  try {
    if (!imageUrl) return;

    // Extract public ID from Cloudinary URL
    // e.g., https://res.cloudinary.com/cloud_name/image/upload/v12345/vaxtrack/vaccines/sample.png
    // The public ID is: vaxtrack/vaccines/sample
    const publicId = imageUrl
      .split("/upload/")[1]
      .split("/")
      .slice(1)
      .join("/")
      .split(".")[0];

    if (publicId) {
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (error) {
    console.error(`Failed to delete image from Cloudinary: ${error.message}`);
  }
};
