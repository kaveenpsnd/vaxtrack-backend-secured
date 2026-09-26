import { jest } from "@jest/globals";

// Mock User model
const mockUserFindById = jest.fn();

jest.unstable_mockModule("../src/models/User.js", () => ({
  default: {
    findById: mockUserFindById,
  },
}));

process.env.JWT_SECRET = "test_jwt_secret_key";

import jwt from "jsonwebtoken";

const { protect, adminOnly, staffOnly } = await import(
  "../src/middleware/authMiddleware.js"
);

describe("Auth Middleware (protect)", () => {
  afterEach(() => jest.clearAllMocks());

  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const sampleUser = {
    _id: "507f1f77bcf86cd799439011",
    name: "John Doe",
    role: "Public",
  };

  test("should authenticate using req.cookies.jwt first", async () => {
    const token = jwt.sign(
      { id: sampleUser._id, role: sampleUser.role },
      process.env.JWT_SECRET
    );
    const req = {
      cookies: { jwt: token },
      headers: {},
    };
    const res = mockRes();
    const next = jest.fn();

    mockUserFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue(sampleUser),
    });

    await protect(req, res, next);

    expect(req.user).toEqual(sampleUser);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("should fallback to req.headers.authorization Bearer token if cookie is missing", async () => {
    const token = jwt.sign(
      { id: sampleUser._id, role: sampleUser.role },
      process.env.JWT_SECRET
    );
    const req = {
      cookies: {},
      headers: {
        authorization: `Bearer ${token}`,
      },
    };
    const res = mockRes();
    const next = jest.fn();

    mockUserFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue(sampleUser),
    });

    await protect(req, res, next);

    expect(req.user).toEqual(sampleUser);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("should throw 401 if neither cookie nor bearer header is present", async () => {
    const req = {
      cookies: {},
      headers: {},
    };
    const res = mockRes();
    const next = jest.fn();

    await expect(protect(req, res, next)).rejects.toThrow(
      "Not authorized, no token"
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("should throw 401 if token is invalid", async () => {
    const req = {
      cookies: { jwt: "invalid.token.structure" },
      headers: {},
    };
    const res = mockRes();
    const next = jest.fn();

    await expect(protect(req, res, next)).rejects.toThrow(
      "Not authorized, token failed"
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("should throw 401 if user from token is not found in database", async () => {
    const token = jwt.sign(
      { id: "nonexistent_id", role: "Public" },
      process.env.JWT_SECRET
    );
    const req = {
      cookies: { jwt: token },
      headers: {},
    };
    const res = mockRes();
    const next = jest.fn();

    mockUserFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    await expect(protect(req, res, next)).rejects.toThrow(
      "Not authorized, user not found"
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
