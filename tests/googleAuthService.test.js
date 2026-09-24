import { jest } from "@jest/globals";

// ── Mock google-auth-library ──
const mockGetToken = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockOAuth2Client = jest.fn(() => ({
  getToken: mockGetToken,
  verifyIdToken: mockVerifyIdToken,
}));

jest.unstable_mockModule("google-auth-library", () => ({
  OAuth2Client: mockOAuth2Client,
}));

const { verifyGoogleSignIn, isGoogleAuthConfigured, GoogleAuthError, GOOGLE_SCOPE } =
  await import("../src/services/googleAuthService.js");

// ── Helpers ──
const CONFIG = {
  GOOGLE_CLIENT_ID: "client-123.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "super-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/auth/google/callback",
};

const NONCE = "nonce-0123456789abcdef";
const REQUEST = { code: "4/auth-code", codeVerifier: "v".repeat(43), nonce: NONCE };

const VALID_PAYLOAD = {
  iss: "https://accounts.google.com",
  aud: CONFIG.GOOGLE_CLIENT_ID,
  sub: "110248495921238986420",
  email: "Kavya.Perera@Gmail.com",
  email_verified: true,
  name: "Kavya Perera",
  nonce: NONCE,
};

const googleReturns = (payload) => {
  mockGetToken.mockResolvedValue({ tokens: { id_token: "header.payload.signature" } });
  mockVerifyIdToken.mockResolvedValue({ getPayload: () => payload });
};

// ────────────────────────────────────────────────────────
// ██  GOOGLE AUTH SERVICE TESTS (OAuth / OIDC)
// ────────────────────────────────────────────────────────

describe("Google Auth Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(process.env, CONFIG);
  });

  describe("isGoogleAuthConfigured", () => {
    test("is true only when client ID, secret and redirect URI are all set", () => {
      expect(isGoogleAuthConfigured()).toBe(true);

      for (const key of Object.keys(CONFIG)) {
        const saved = process.env[key];
        delete process.env[key];
        expect(isGoogleAuthConfigured()).toBe(false);
        process.env[key] = saved;
      }
    });

    test("requests only the openid, email and profile scopes", () => {
      expect(GOOGLE_SCOPE).toBe("openid email profile");
    });
  });

  describe("verifyGoogleSignIn — code exchange", () => {
    test("redeems the code with the PKCE verifier and the configured redirect URI", async () => {
      googleReturns(VALID_PAYLOAD);

      await verifyGoogleSignIn(REQUEST);

      expect(mockOAuth2Client).toHaveBeenCalledWith({
        clientId: CONFIG.GOOGLE_CLIENT_ID,
        clientSecret: CONFIG.GOOGLE_CLIENT_SECRET,
        redirectUri: CONFIG.GOOGLE_REDIRECT_URI,
      });
      expect(mockGetToken).toHaveBeenCalledWith({
        code: REQUEST.code,
        codeVerifier: REQUEST.codeVerifier,
        redirect_uri: CONFIG.GOOGLE_REDIRECT_URI,
      });
    });

    test("rejects when Google refuses the code (e.g. invalid_grant, PKCE mismatch)", async () => {
      mockGetToken.mockRejectedValue(new Error("invalid_grant"));

      await expect(verifyGoogleSignIn(REQUEST)).rejects.toThrow(GoogleAuthError);
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    test("rejects when Google returns no ID token", async () => {
      mockGetToken.mockResolvedValue({ tokens: { access_token: "only-an-access-token" } });

      await expect(verifyGoogleSignIn(REQUEST)).rejects.toThrow("did not return an ID token");
    });
  });

  describe("verifyGoogleSignIn — ID token verification", () => {
    test("verifies the ID token against our client ID as audience", async () => {
      googleReturns(VALID_PAYLOAD);

      await verifyGoogleSignIn(REQUEST);

      expect(mockVerifyIdToken).toHaveBeenCalledWith({
        idToken: "header.payload.signature",
        audience: CONFIG.GOOGLE_CLIENT_ID,
      });
    });

    test("rejects a token the library refuses (bad signature, wrong aud/iss, expired)", async () => {
      mockGetToken.mockResolvedValue({ tokens: { id_token: "forged.token.sig" } });
      mockVerifyIdToken.mockRejectedValue(new Error("Invalid token signature"));

      await expect(verifyGoogleSignIn(REQUEST)).rejects.toThrow(GoogleAuthError);
    });

    test("rejects a token whose nonce does not match the request (replay)", async () => {
      googleReturns({ ...VALID_PAYLOAD, nonce: "someone-elses-nonce-value" });

      await expect(verifyGoogleSignIn(REQUEST)).rejects.toThrow("nonce does not match");
    });

    test("rejects a token with no nonce", async () => {
      const { nonce, ...withoutNonce } = VALID_PAYLOAD;
      googleReturns(withoutNonce);

      await expect(verifyGoogleSignIn(REQUEST)).rejects.toThrow("nonce does not match");
    });

    test("rejects an unverified Google email", async () => {
      googleReturns({ ...VALID_PAYLOAD, email_verified: false });

      await expect(verifyGoogleSignIn(REQUEST)).rejects.toThrow("not verified");
    });

    test("rejects when email_verified is missing or not a real boolean", async () => {
      googleReturns({ ...VALID_PAYLOAD, email_verified: undefined });
      await expect(verifyGoogleSignIn(REQUEST)).rejects.toThrow("not verified");

      googleReturns({ ...VALID_PAYLOAD, email_verified: "true" });
      await expect(verifyGoogleSignIn(REQUEST)).rejects.toThrow("not verified");
    });

    test("rejects a token with no subject", async () => {
      googleReturns({ ...VALID_PAYLOAD, sub: undefined });

      await expect(verifyGoogleSignIn(REQUEST)).rejects.toThrow("no subject");
    });
  });

  describe("verifyGoogleSignIn — result", () => {
    test("returns the Google ID, a lower-cased email and the name", async () => {
      googleReturns(VALID_PAYLOAD);

      await expect(verifyGoogleSignIn(REQUEST)).resolves.toEqual({
        googleId: VALID_PAYLOAD.sub,
        email: "kavya.perera@gmail.com",
        name: "Kavya Perera",
      });
    });

    test("falls back to the email's local part when Google sends no name", async () => {
      googleReturns({ ...VALID_PAYLOAD, name: undefined });

      const identity = await verifyGoogleSignIn(REQUEST);

      expect(identity.name).toBe("kavya.perera");
    });

    test("never returns a role, whatever claims the token carries", async () => {
      googleReturns({ ...VALID_PAYLOAD, role: "Admin", "https://vaxtrack/role": "Admin" });

      const identity = await verifyGoogleSignIn(REQUEST);

      expect(identity).not.toHaveProperty("role");
    });
  });
});
