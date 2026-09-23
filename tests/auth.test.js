import { jest } from "@jest/globals";

// ── Mock Modules ──

const mockUserFindOne = jest.fn();
const mockUserCreate = jest.fn();
const mockMatchPassword = jest.fn();

jest.unstable_mockModule("../src/models/User.js", () => ({
  default: {
    findOne: mockUserFindOne,
    create: mockUserCreate,
  },
}));

// Use a fixed secret so we can decode the token in assertions
process.env.JWT_SECRET = "test_secret_for_auth";

// Import jsonwebtoken AFTER setting the env var
import jwt from "jsonwebtoken";

// Import AFTER mocking
const { registerUser, authUser } =
  await import("../src/controllers/authController.js");

// ── Helpers ──
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
};

const VALID_USER = {
  _id: "507f1f77bcf86cd799439011",
  name: "Test User",
  email: "test@example.com",
  role: "HospitalStaff",
  matchPassword: mockMatchPassword,
};

// ────────────────────────────────────────────────────────
// ██  AUTH CONTROLLER TESTS
// ────────────────────────────────────────────────────────

describe("Auth Controller", () => {
  afterEach(() => jest.clearAllMocks());

  // ===================================================
  // POST /api/auth/register — registerUser
  // ===================================================
  describe("registerUser", () => {
    const validBody = {
      name: "Test User",
      email: "test@example.com",
      password: "password123",
      role: "HospitalStaff",
      nic: "123456789V",
      phone: "+94771234567",
    };

    test("should register user and set jwt cookie containing id and role", async () => {
      mockUserFindOne.mockResolvedValue(null); // no existing user
      mockUserCreate.mockResolvedValue(VALID_USER);

      const req = { body: validBody };
      const res = mockRes();

      await registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(201);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData).toMatchObject({
        _id: VALID_USER._id,
        name: VALID_USER.name,
        email: VALID_USER.email,
        role: VALID_USER.role,
      });
      expect(responseData.token).toBeUndefined();

      expect(res.cookie).toHaveBeenCalledWith(
        "jwt",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60 * 1000,
        })
      );

      const cookieToken = res.cookie.mock.calls[0][1];
      const decoded = jwt.verify(cookieToken, process.env.JWT_SECRET);
      expect(decoded.id).toBe(String(VALID_USER._id));
      expect(decoded.role).toBe(VALID_USER.role);
    });

    test("should force role to Public and ignore a client-supplied role (issue #1)", async () => {
      mockUserFindOne.mockResolvedValue(null);
      mockUserCreate.mockImplementation(async (doc) => ({
        _id: VALID_USER._id,
        ...doc,
      }));

      const req = { body: { ...validBody, role: "Admin" } };
      const res = mockRes();

      await registerUser(req, res);

      // The role passed to the model must be Public regardless of the request
      expect(mockUserCreate).toHaveBeenCalledTimes(1);
      const createdDoc = mockUserCreate.mock.calls[0][0];
      expect(createdDoc.role).toBe("Public");

      // All other registration fields still pass through untouched
      expect(createdDoc).toMatchObject({
        name: validBody.name,
        email: validBody.email,
        password: validBody.password,
        nic: validBody.nic,
        phone: validBody.phone,
      });

      // Response and JWT must reflect the forced role, not the requested one
      expect(res.status).toHaveBeenCalledWith(201);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.role).toBe("Public");
      expect(responseData.token).toBeUndefined();

      const cookieToken = res.cookie.mock.calls[0][1];
      const decoded = jwt.verify(cookieToken, process.env.JWT_SECRET);
      expect(decoded.role).toBe("Public");
    });

    test("should return 400 if user already exists", async () => {
      mockUserFindOne.mockResolvedValue(VALID_USER); // user already exists

      const req = { body: validBody };
      const res = mockRes();

      await expect(registerUser(req, res)).rejects.toThrow(
        "User already exists",
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ===================================================
  // POST /api/auth/login — authUser
  // ===================================================
  describe("authUser", () => {
    test("should login user and set jwt cookie containing id and role", async () => {
      mockMatchPassword.mockResolvedValue(true);
      mockUserFindOne.mockResolvedValue(VALID_USER);

      const req = {
        body: { email: "test@example.com", password: "password123" },
      };
      const res = mockRes();

      await authUser(req, res);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData).toMatchObject({
        _id: VALID_USER._id,
        name: VALID_USER.name,
        email: VALID_USER.email,
        role: VALID_USER.role,
      });
      expect(responseData.token).toBeUndefined();

      expect(res.cookie).toHaveBeenCalledWith(
        "jwt",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60 * 1000,
        })
      );

      const cookieToken = res.cookie.mock.calls[0][1];
      const decoded = jwt.verify(cookieToken, process.env.JWT_SECRET);
      expect(decoded.id).toBe(String(VALID_USER._id));
      expect(decoded.role).toBe(VALID_USER.role);
    });

    test("should return 401 if password does not match", async () => {
      mockMatchPassword.mockResolvedValue(false);
      mockUserFindOne.mockResolvedValue(VALID_USER);

      const req = {
        body: { email: "test@example.com", password: "wrongpassword" },
      };
      const res = mockRes();

      await expect(authUser(req, res)).rejects.toThrow(
        "Invalid email or password",
      );
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("should return 401 if user is not found", async () => {
      mockUserFindOne.mockResolvedValue(null);

      const req = {
        body: { email: "nobody@example.com", password: "password123" },
      };
      const res = mockRes();

      await expect(authUser(req, res)).rejects.toThrow(
        "Invalid email or password",
      );
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
