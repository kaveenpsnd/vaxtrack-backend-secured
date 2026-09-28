/**
 * File Helper — Magic Byte Validation for Uploaded Files (Finding #7)
 * 
 * Inspects binary buffers for genuine file signatures (magic numbers) to prevent
 * client-controlled MIME-type spoofing and arbitrary file uploads.
 */

/**
 * Detects the MIME type of an image buffer based on its binary magic bytes.
 *
 * Supported Signatures:
 * - JPEG / JPG: FF D8 FF
 * - PNG: 89 50 4E 47 0D 0A 1A 0A
 * - WebP: 52 49 46 46 (RIFF) + 57 45 42 50 (WEBP)
 *
 * @param {Buffer} buffer - File buffer
 * @returns {string | null} Detected MIME type or null if invalid
 */
export const detectImageMimeType = (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // Check JPEG magic bytes: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // Check PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // Check WebP magic bytes: RIFF....WEBP
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
};

/**
 * Validates whether a buffer is a genuine image (JPEG, PNG, or WebP).
 *
 * @param {Buffer} buffer - File buffer to test
 * @returns {boolean} True if the buffer contains valid image magic bytes
 */
export const isValidImageBuffer = (buffer) => {
  return detectImageMimeType(buffer) !== null;
};
