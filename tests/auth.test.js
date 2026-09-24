import { jest } from "@jest/globals";

// ── Mock Modules ──

const mockUserFindOne = jest.fn();
const mockUserCreate = jest.fn();
const mockUserFindById = jest.fn();
const mockMatchPassword = jest.fn();

jest.unstable_mockModule("../src/models/User.js", () => ({
  default: {
    findOne: mockUserFindOne,
    create: mockUserCreate,
    findById: mockUserFindById,
  },
}));

// Use a fixed secret so we can decode the token in assertions
process.env.JWT_SECRET = "test_secret_for_auth";

// Import jsonwebtoken AFTER setting the env var
import jwt from "jsonwebtoken";

// Import AFTER mocking
const { registerUser, authUser, logoutUser, updateUserProfile } =
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

    test("should register user, set jwt cookie, and not return token in body", async () => {
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

      // Verify cookie was set
      expect(res.cookie).toHaveBeenCalledWith(
        "jwt",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 30 * 24 * 60 * 60 * 1000,
        })
      );

      // Decode the token and verify it contains both id and role
      const setCookieCall = res.cookie.mock.calls[0];
      const token = setCookieCall[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

      const setCookieCall = res.cookie.mock.calls[0];
      const token = setCookieCall[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
    test("should login user, set jwt cookie, and not return token in body", async () => {
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

      // Verify cookie was set
      expect(res.cookie).toHaveBeenCalledWith(
        "jwt",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 30 * 24 * 60 * 60 * 1000,
        })
      );

      // Decode the token and verify it contains both id and role
      const setCookieCall = res.cookie.mock.calls[0];
      const token = setCookieCall[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

  // ===================================================
  // POST /api/auth/logout — logoutUser
  // ===================================================
  describe("logoutUser", () => {
    test("should clear jwt cookie and return success message", () => {
      const req = {};
      const res = mockRes();

      logoutUser(req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        "jwt",
        "",
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: "none",
          expires: new Date(0),
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Logged out successfully",
      });
    });
  });

  // ===================================================
  // PUT /api/users/profile — updateUserProfile
  // ===================================================
  describe("updateUserProfile (OWASP A07 Re-Authentication)", () => {
    const existingUserDoc = {
      _id: VALID_USER._id,
      name: "Existing Name",
      email: "existing@example.com",
      phone: "+94771234567",
      nic: "123456789V",
      address: "123 Old St",
      role: "Public",
      matchPassword: jest.fn(),
      save: jest.fn(),
    };

    test("should allow updating non-sensitive fields without currentPassword", async () => {
      const mockDoc = {
        ...existingUserDoc,
        save: jest.fn().mockImplementation(async function () {
          return this;
        }),
      };
      mockUserFindById.mockResolvedValue(mockDoc);

      const req = {
        user: { _id: VALID_USER._id },
        body: {
          name: "New Name",
          address: "456 New St",
          nic: "987654321V",
        },
      };
      const res = mockRes();

      await updateUserProfile(req, res);

      expect(mockDoc.name).toBe("New Name");
      expect(mockDoc.address).toBe("456 New St");
      expect(mockDoc.nic).toBe("987654321V");
      expect(mockDoc.matchPassword).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: VALID_USER._id,
          name: "New Name",
          address: "456 New St",
          nic: "987654321V",
        })
      );
    });

    test("should require currentPassword when updating email", async () => {
      const mockDoc = { ...existingUserDoc };
      mockUserFindById.mockResolvedValue(mockDoc);

      const req = {
        user: { _id: VALID_USER._id },
        body: {
          email: "newemail@example.com",
        },
      };
      const res = mockRes();

      await updateUserProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Current password is required to update sensitive information.",
      });
      expect(mockDoc.save).not.toHaveBeenCalled();
    });

    test("should require currentPassword when updating password", async () => {
      const mockDoc = { ...existingUserDoc };
      mockUserFindById.mockResolvedValue(mockDoc);

      const req = {
        user: { _id: VALID_USER._id },
        body: {
          password: "newpassword123",
        },
      };
      const res = mockRes();

      await updateUserProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Current password is required to update sensitive information.",
      });
      expect(mockDoc.save).not.toHaveBeenCalled();
    });

    test("should require currentPassword when updating phone", async () => {
      const mockDoc = { ...existingUserDoc };
      mockUserFindById.mockResolvedValue(mockDoc);

      const req = {
        user: { _id: VALID_USER._id },
        body: {
          phone: "+94779999999",
        },
      };
      const res = mockRes();

      await updateUserProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Current password is required to update sensitive information.",
      });
      expect(mockDoc.save).not.toHaveBeenCalled();
    });

    test("should reject update if currentPassword does not match", async () => {
      const mockDoc = {
        ...existingUserDoc,
        matchPassword: jest.fn().mockResolvedValue(false),
      };
      mockUserFindById.mockResolvedValue(mockDoc);

      const req = {
        user: { _id: VALID_USER._id },
        body: {
          email: "newemail@example.com",
          currentPassword: "wrongPassword",
        },
      };
      const res = mockRes();

      await updateUserProfile(req, res);

      expect(mockDoc.matchPassword).toHaveBeenCalledWith("wrongPassword");
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Incorrect current password.",
      });
      expect(mockDoc.save).not.toHaveBeenCalled();
    });

    test("should successfully update sensitive fields when valid currentPassword is provided", async () => {
      const mockDoc = {
        ...existingUserDoc,
        matchPassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockImplementation(async function () {
          return this;
        }),
      };
      mockUserFindById.mockResolvedValue(mockDoc);

      const req = {
        user: { _id: VALID_USER._id },
        body: {
          email: "newemail@example.com",
          phone: "+94779999999",
          password: "newPassword123",
          currentPassword: "correctPassword",
        },
      };
      const res = mockRes();

      await updateUserProfile(req, res);

      expect(mockDoc.matchPassword).toHaveBeenCalledWith("correctPassword");
      expect(mockDoc.email).toBe("newemail@example.com");
      expect(mockDoc.phone).toBe("+94779999999");
      expect(mockDoc.password).toBe("newPassword123");
      expect(mockDoc.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: VALID_USER._id,
          email: "newemail@example.com",
          phone: "+94779999999",
        })
      );
    });
  });
});
