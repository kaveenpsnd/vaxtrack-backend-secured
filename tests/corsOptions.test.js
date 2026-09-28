import corsOptions, {
  getAllowedOrigins,
  originChecker,
  parseOrigins,
} from "../src/config/corsOptions.js";

// Helper: run the cors origin callback synchronously and return the decision
const isAllowed = (origin) => {
  let allowed;
  originChecker(origin, (err, result) => {
    expect(err).toBeNull();
    allowed = result;
  });
  return allowed;
};

describe("CORS configuration (Finding #6)", () => {
  const originalEnv = process.env.CORS_ORIGINS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = originalEnv;
    }
  });

  describe("parseOrigins", () => {
    test("splits a comma-separated list and trims whitespace", () => {
      expect(parseOrigins("https://a.app, http://localhost:5173")).toEqual([
        "https://a.app",
        "http://localhost:5173",
      ]);
    });

    test("ignores empty entries and non-string input", () => {
      expect(parseOrigins("https://a.app,,  ,")).toEqual(["https://a.app"]);
      expect(parseOrigins("")).toEqual([]);
      expect(parseOrigins(undefined)).toEqual([]);
      expect(parseOrigins(null)).toEqual([]);
    });
  });

  describe("getAllowedOrigins", () => {
    test("falls back to the deployed frontend and local dev server", () => {
      delete process.env.CORS_ORIGINS;
      expect(getAllowedOrigins()).toEqual([
        "https://vaxtrackweb.netlify.app",
        "http://localhost:5173",
      ]);
    });

    test("uses CORS_ORIGINS when it is set", () => {
      process.env.CORS_ORIGINS = "https://staging.vaxtrack.lk";
      expect(getAllowedOrigins()).toEqual(["https://staging.vaxtrack.lk"]);
    });
  });

  describe("originChecker", () => {
    test("allows the deployed frontend origin", () => {
      delete process.env.CORS_ORIGINS;
      expect(isAllowed("https://vaxtrackweb.netlify.app")).toBe(true);
    });

    test("allows the local dev server origin", () => {
      delete process.env.CORS_ORIGINS;
      expect(isAllowed("http://localhost:5173")).toBe(true);
    });

    test("rejects an unknown origin so no Allow-Origin header is sent", () => {
      delete process.env.CORS_ORIGINS;
      expect(isAllowed("https://evil.example")).toBe(false);
    });

    test("rejects look-alike origins (prefix, suffix and scheme tricks)", () => {
      delete process.env.CORS_ORIGINS;
      expect(isAllowed("https://vaxtrackweb.netlify.app.evil.example")).toBe(false);
      expect(isAllowed("https://evil-vaxtrackweb.netlify.app")).toBe(false);
      expect(isAllowed("http://vaxtrackweb.netlify.app")).toBe(false);
      expect(isAllowed("null")).toBe(false);
    });

    test("allows requests with no Origin header (curl, Postman, server-to-server)", () => {
      expect(isAllowed(undefined)).toBe(true);
      expect(isAllowed("")).toBe(true);
    });

    test("honours a changed CORS_ORIGINS without a restart of the module", () => {
      process.env.CORS_ORIGINS = "https://staging.vaxtrack.lk";
      expect(isAllowed("https://staging.vaxtrack.lk")).toBe(true);
      expect(isAllowed("https://vaxtrackweb.netlify.app")).toBe(false);
    });
  });

  describe("corsOptions", () => {
    test("restricts request headers to Content-Type and Authorization", () => {
      expect(corsOptions.allowedHeaders).toEqual(["Content-Type", "Authorization"]);
    });

    test("only permits the HTTP methods the API actually uses", () => {
      expect(corsOptions.methods).toEqual([
        "GET",
        "HEAD",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
      ]);
      expect(corsOptions.methods).not.toContain("TRACE");
    });

    test("uses the allowlist checker, never a wildcard or reflect-all origin", () => {
      // This is what keeps `credentials: true` (cookie auth) safe: with '*' or
      // `true` any site could send requests carrying the user's cookies.
      expect(corsOptions.origin).toBe(originChecker);
      expect(corsOptions.origin).not.toBe("*");
      expect(corsOptions.origin).not.toBe(true);
    });

    test("enables credentials for cookie authentication", () => {
      expect(corsOptions.credentials).toBe(true);
    });
  });
});
