import { jest } from "@jest/globals";

// ── Mock Modules ──

const mockUserFindOne = jest.fn();
const mockUserCreate = jest.fn();

jest.unstable_mockModule("../src/models/User.js", () => ({
  default: {
    findOne: mockUserFindOne,
    create: mockUserCreate,
  },
}));

class MockGoogleAuthError extends Error {}
const mockVerifyGoogleSignIn = jest.fn();
const mockIsGoogleAuthConfigured = jest.fn();

jest.unstable_mockModule("../src/services/googleAuthService.js", () => ({
  GOOGLE_SCOPE: "openid email profile",
  GoogleAuthError: MockGoogleAuthError,
  getGoogleConfig: () => ({
    clientId: "client-123.apps.googleusercontent.com",
    clientSecret: "super-secret",
    redirectUri: "http://localhost:5173/auth/google/callback",
  }),
  isGoogleAuthConfigured: mockIsGoogleAuthConfigured,
  verifyGoogleSignIn: mockVerifyGoogleSignIn,
}));

// Use a fixed secret so we can decode the session token in assertions
process.env.JWT_SECRET = "test_secret_for_oauth";

import jwt from "jsonwebtoken";

// Import AFTER mocking
const { googleCallback, getGoogleClientConfig } = await import(
  "../src/controllers/oauthController.js"
);

// ── Helpers ──
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
};

const IDENTITY = {
  googleId: "110248495921238986420",
  email: "kavya.perera@gmail.com",
  name: "Kavya Perera",
};

const VALID_BODY = {
  code: "4/auth-code",
  codeVerifier: "v".repeat(43),
  nonce: "nonce-0123456789abcdef",
};

const makeUser = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439011",
  name: "Kavya Perera",
  email: "kavya.perera@gmail.com",
  role: "Public",
  profilePicture: null,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

// Stand-in for the users collection, keyed by the field being queried.
// findOne() returns a promise that also supports .collation() like a Query.
const mockCollation = jest.fn();
const usersBy = (lookup) => {
  mockUserFindOne.mockImplementation((filter) => {
    const field = Object.keys(filter)[0];
    const result = lookup[field] ?? null;
    const query = Promise.resolve(result);
    query.collation = mockCollation.mockReturnValue(Promise.resolve(result));
    return query;
  });
};

const sessionRole = (res) => {
  const [name, token, options] = res.cookie.mock.calls[0];
  expect(name).toBe("jwt");
  expect(options.httpOnly).toBe(true);
  return jwt.verify(token, process.env.JWT_SECRET).role;
};

// ────────────────────────────────────────────────────────
// ██  OAUTH CONTROLLER TESTS (Sign in with Google)
// ────────────────────────────────────────────────────────

describe("OAuth Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleAuthConfigured.mockReturnValue(true);
    mockVerifyGoogleSignIn.mockResolvedValue(IDENTITY);
    usersBy({});
  });

  // ===================================================
  // GET /api/auth/google/config
  // ===================================================
  describe("getGoogleClientConfig", () => {
    test("returns the client ID, redirect URI and scope but never the secret", () => {
      const res = mockRes();

      getGoogleClientConfig({}, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body).toEqual({
        clientId: "client-123.apps.googleusercontent.com",
        redirectUri: "http://localhost:5173/auth/google/callback",
        scope: "openid email profile",
      });
      expect(JSON.stringify(body)).not.toContain("super-secret");
    });

    test("returns 503 when Google sign-in is not configured", () => {
      mockIsGoogleAuthConfigured.mockReturnValue(false);
      const res = mockRes();

      getGoogleClientConfig({}, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===================================================
  // POST /api/auth/google/callback — input validation
  // ===================================================
  describe("googleCallback — input validation", () => {
    test("returns 503 when Google sign-in is not configured", async () => {
      mockIsGoogleAuthConfigured.mockReturnValue(false);
      const res = mockRes();

      await googleCallback({ body: VALID_BODY }, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(mockVerifyGoogleSignIn).not.toHaveBeenCalled();
    });

    test.each([
      ["missing code", { ...VALID_BODY, code: undefined }],
      ["non-string code", { ...VALID_BODY, code: { $ne: null } }],
      ["missing codeVerifier", { ...VALID_BODY, codeVerifier: undefined }],
      ["codeVerifier shorter than 43 chars", { ...VALID_BODY, codeVerifier: "v".repeat(42) }],
      ["codeVerifier with illegal characters", { ...VALID_BODY, codeVerifier: "v".repeat(42) + "!" }],
      ["missing nonce", { ...VALID_BODY, nonce: undefined }],
      ["nonce shorter than 16 chars", { ...VALID_BODY, nonce: "short" }],
    ])("returns 400 for %s", async (_label, body) => {
      const res = mockRes();

      await googleCallback({ body }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockVerifyGoogleSignIn).not.toHaveBeenCalled();
    });
  });

  // ===================================================
  // POST /api/auth/google/callback — Google verification
  // ===================================================
  describe("googleCallback — Google verification", () => {
    test("passes code, verifier and nonce to the Google service", async () => {
      const res = mockRes();
      usersBy({ googleId: makeUser({ googleId: IDENTITY.googleId }) });

      await googleCallback({ body: VALID_BODY }, res);

      expect(mockVerifyGoogleSignIn).toHaveBeenCalledWith(VALID_BODY);
    });

    test("returns a generic 401 and no session when Google rejects the sign-in", async () => {
      mockVerifyGoogleSignIn.mockRejectedValue(
        new MockGoogleAuthError("ID token nonce does not match the request")
      );
      const res = mockRes();
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await googleCallback({ body: VALID_BODY }, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json.mock.calls[0][0].message).toBe("Google sign-in failed. Please try again.");
      expect(res.cookie).not.toHaveBeenCalled();
      expect(mockUserFindOne).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("lets unexpected (non-Google) errors reach the global error handler", async () => {
      mockVerifyGoogleSignIn.mockRejectedValue(new TypeError("boom"));

      await expect(googleCallback({ body: VALID_BODY }, mockRes())).rejects.toThrow("boom");
    });
  });

  // ===================================================
  // POST /api/auth/google/callback — existing accounts
  // ===================================================
  describe("googleCallback — existing accounts", () => {
    test("signs in an account already linked to this Google ID", async () => {
      const user = makeUser({ googleId: IDENTITY.googleId });
      usersBy({ googleId: user });
      const res = mockRes();

      await googleCallback({ body: VALID_BODY }, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(sessionRole(res)).toBe("Public");
      expect(res.json).toHaveBeenCalledWith({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: "Public",
        profilePicture: null,
      });
      expect(user.save).not.toHaveBeenCalled();
    });

    test("links an existing patient account with the same verified email on first use", async () => {
      const user = makeUser();
      usersBy({ email: user });
      const res = mockRes();

      await googleCallback({ body: VALID_BODY }, res);

      expect(mockCollation).toHaveBeenCalledWith({ locale: "en", strength: 2 });
      expect(user.googleId).toBe(IDENTITY.googleId);
      expect(user.save).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(sessionRole(res)).toBe("Public");
    });

    test("returns 409 when the email is linked to a different Google account", async () => {
      usersBy({ email: makeUser({ googleId: "some-other-google-sub" }) });
      const res = mockRes();

      await googleCallback({ body: VALID_BODY }, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    test.each(["HospitalStaff", "Admin"])(
      "refuses Google sign-in for a %s account matched by email, without linking it",
      async (role) => {
        const user = makeUser({ role });
        usersBy({ email: user });
        const res = mockRes();

        await googleCallback({ body: VALID_BODY }, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.cookie).not.toHaveBeenCalled();
        expect(user.googleId).toBeUndefined();
        expect(user.save).not.toHaveBeenCalled();
      }
    );

    test("refuses Google sign-in for a linked account later promoted to staff", async () => {
      usersBy({ googleId: makeUser({ googleId: IDENTITY.googleId, role: "HospitalStaff" }) });
      const res = mockRes();

      await googleCallback({ body: VALID_BODY }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  // ===================================================
  // POST /api/auth/google/callback — new accounts
  // ===================================================
  describe("googleCallback — new accounts", () => {
    test("asks the frontend to collect NIC and phone when no account exists", async () => {
      const res = mockRes();

      await googleCallback({ body: VALID_BODY }, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0]).toMatchObject({
        needsRegistration: true,
        profile: { name: IDENTITY.name, email: IDENTITY.email },
      });
      expect(mockUserCreate).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    });

    test("creates a Public patient account from the Google identity plus NIC and phone", async () => {
      const created = makeUser({ googleId: IDENTITY.googleId });
      mockUserCreate.mockResolvedValue(created);
      const res = mockRes();

      await googleCallback(
        { body: { ...VALID_BODY, nic: " 199012345678 ", phone: "0771234567", address: "Colombo 03" } },
        res
      );

      expect(mockUserCreate).toHaveBeenCalledWith({
        name: IDENTITY.name,
        email: IDENTITY.email,
        googleId: IDENTITY.googleId,
        role: "Public",
        nic: "199012345678",
        phone: "0771234567",
        address: "Colombo 03",
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(sessionRole(res)).toBe("Public");
    });

    test("ignores a role supplied in the request body (role spoofing)", async () => {
      mockUserCreate.mockResolvedValue(makeUser({ googleId: IDENTITY.googleId }));
      const res = mockRes();

      await googleCallback(
        { body: { ...VALID_BODY, nic: "199012345678", phone: "0771234567", role: "Admin" } },
        res
      );

      expect(mockUserCreate.mock.calls[0][0].role).toBe("Public");
      expect(sessionRole(res)).toBe("Public");
    });

    test("does not accept a password or name from the request for Google accounts", async () => {
      mockUserCreate.mockResolvedValue(makeUser({ googleId: IDENTITY.googleId }));

      await googleCallback(
        {
          body: {
            ...VALID_BODY,
            nic: "199012345678",
            phone: "0771234567",
            password: "chosen-by-attacker",
            name: "Not From Google",
            email: "someone-else@example.com",
          },
        },
        mockRes()
      );

      const created = mockUserCreate.mock.calls[0][0];
      expect(created).not.toHaveProperty("password");
      expect(created.name).toBe(IDENTITY.name);
      expect(created.email).toBe(IDENTITY.email);
    });

    test("returns 409 when the NIC already belongs to another account", async () => {
      usersBy({ nic: makeUser({ email: "other@example.com" }) });
      const res = mockRes();

      await googleCallback({ body: { ...VALID_BODY, nic: "199012345678", phone: "0771234567" } }, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    test("returns 409 when a concurrent sign-up wins the unique index race", async () => {
      mockUserCreate.mockRejectedValue(Object.assign(new Error("E11000 duplicate key"), { code: 11000 }));
      const res = mockRes();

      await googleCallback({ body: { ...VALID_BODY, nic: "199012345678", phone: "0771234567" } }, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    test("returns 400 for a non-string address", async () => {
      const res = mockRes();

      await googleCallback(
        { body: { ...VALID_BODY, nic: "199012345678", phone: "0771234567", address: { $gt: "" } } },
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockUserCreate).not.toHaveBeenCalled();
    });
  });
});
