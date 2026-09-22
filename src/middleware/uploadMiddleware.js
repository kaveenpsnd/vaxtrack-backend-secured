import multer from "multer";
import { detectImageMimeType } from "../helpers/fileHelper.js";

const storage = multer.memoryStorage();

const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
const allowedExts = /\.(jpe?g|png|webp)$/i;

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    // 1. Initial check on declared MIME type and file extension
    const isValidMime = allowedMimes.includes(file.mimetype);
    const isValidExt = allowedExts.test(file.originalname);

    if (!isValidMime || !isValidExt) {
      return cb(
        new Error("Only JPEG, PNG, and WebP images are allowed"),
        false
      );
    }
    cb(null, true);
  },
});

/**
 * Middleware to validate uploaded file content (magic bytes) after Multer buffers the file.
 * Prevents client-controlled MIME-type spoofing (Finding #7).
 */
export const validateImageFile = (req, res, next) => {
  if (!req.file) {
    return next();
  }

  // Ensure file buffer exists
  if (!req.file.buffer || !Buffer.isBuffer(req.file.buffer)) {
    return res.status(400).json({
      success: false,
      message: "Invalid file buffer received.",
    });
  }

  // Sniff binary magic bytes
  const detectedMime = detectImageMimeType(req.file.buffer);

  if (!detectedMime || !allowedMimes.includes(detectedMime)) {
    return res.status(400).json({
      success: false,
      message: "Invalid file content. Uploaded file signature does not match permitted image formats (JPEG, PNG, WebP).",
    });
  }

  // Reject spoofed uploads where declared MIME type does not match actual magic bytes
  if (req.file.mimetype && req.file.mimetype !== detectedMime) {
    return res.status(400).json({
      success: false,
      message: `Spoofed MIME type detected: file header signature indicates ${detectedMime} but request declared ${req.file.mimetype}.`,
    });
  }

  next();
};

export default upload;
