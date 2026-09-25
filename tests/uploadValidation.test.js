import { jest } from "@jest/globals";
import {
  detectImageMimeType,
  isValidImageBuffer,
} from "../src/helpers/fileHelper.js";
import { validateImageFile } from "../src/middleware/uploadMiddleware.js";

describe("Upload File Security & Magic Byte Validation (Finding #7)", () => {
  // Sample valid magic byte signatures
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const validWebpBuffer = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0x24, 0x00, 0x00, 0x00]), // 4 bytes file size
    Buffer.from("WEBP", "ascii"),
  ]);

  // Malicious/fake image payloads (spoofed MIME types)
  const maliciousHtmlBuffer = Buffer.from(
    "<html><script>alert(document.cookie)</script></html>",
    "utf-8"
  );
  const maliciousShellBuffer = Buffer.from(
    "#!/bin/bash\ncat /etc/passwd\n",
    "utf-8"
  );

  describe("fileHelper: detectImageMimeType & isValidImageBuffer", () => {
    test("should correctly detect genuine JPEG magic bytes", () => {
      expect(detectImageMimeType(validJpegBuffer)).toBe("image/jpeg");
      expect(isValidImageBuffer(validJpegBuffer)).toBe(true);
    });

    test("should correctly detect genuine PNG magic bytes", () => {
      expect(detectImageMimeType(validPngBuffer)).toBe("image/png");
      expect(isValidImageBuffer(validPngBuffer)).toBe(true);
    });

    test("should correctly detect genuine WebP magic bytes", () => {
      expect(detectImageMimeType(validWebpBuffer)).toBe("image/webp");
      expect(isValidImageBuffer(validWebpBuffer)).toBe(true);
    });

    test("should reject non-image buffers disguised as images", () => {
      expect(detectImageMimeType(maliciousHtmlBuffer)).toBeNull();
      expect(isValidImageBuffer(maliciousHtmlBuffer)).toBe(false);

      expect(detectImageMimeType(maliciousShellBuffer)).toBeNull();
      expect(isValidImageBuffer(maliciousShellBuffer)).toBe(false);
    });

    test("should safely reject null, undefined, empty, or truncated buffers", () => {
      expect(detectImageMimeType(null)).toBeNull();
      expect(detectImageMimeType(undefined)).toBeNull();
      expect(detectImageMimeType(Buffer.alloc(0))).toBeNull();
      expect(detectImageMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
      expect(isValidImageBuffer("not a buffer")).toBe(false);
    });
  });

  describe("uploadMiddleware: validateImageFile", () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
      mockReq = {};
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      mockNext = jest.fn();
    });

    test("should call next() if no file was uploaded in the request", () => {
      mockReq.file = undefined;
      validateImageFile(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test("should accept valid PNG buffer with matching declared MIME type", () => {
      mockReq.file = {
        originalname: "avatar.png",
        mimetype: "image/png",
        buffer: validPngBuffer,
      };

      validateImageFile(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test("should accept valid JPEG buffer with matching declared MIME type", () => {
      mockReq.file = {
        originalname: "vaccine.jpg",
        mimetype: "image/jpeg",
        buffer: validJpegBuffer,
      };

      validateImageFile(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test("should reject spoofed upload: HTML content declared as image/png (CVE/Stored XSS vector)", () => {
      mockReq.file = {
        originalname: "malicious.png",
        mimetype: "image/png",
        buffer: maliciousHtmlBuffer,
      };

      validateImageFile(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("signature does not match permitted image formats"),
        })
      );
    });

    test("should reject spoofed upload: JPEG content declared as image/png (MIME mismatch)", () => {
      mockReq.file = {
        originalname: "mismatched.png",
        mimetype: "image/png",
        buffer: validJpegBuffer, // Actually a JPEG
      };

      validateImageFile(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("Spoofed MIME type detected"),
        })
      );
    });

    test("should reject when file buffer is missing or corrupted", () => {
      mockReq.file = {
        originalname: "broken.png",
        mimetype: "image/png",
        buffer: null,
      };

      validateImageFile(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
