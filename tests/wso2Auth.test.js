import 'dotenv/config';
import { jest } from '@jest/globals';
import http from 'node:http';
import cookieParser from 'cookie-parser';
import express from 'express';

// End-to-end tests of the WSO2 sign-in against the team's REAL WSO2 Identity
// Server. Only the user database is replaced, by an in-memory list.
// They need the WSO2_* settings in .env and network access, so they are
// skipped when those settings are missing (e.g. in CI).

const hasWso2 = ['WSO2_BASE', 'WSO2_CLIENT_ID', 'WSO2_CLIENT_SECRET', 'WSO2_REDIRECT_URI'].every(
  (name) => process.env[name],
);
const describeWso2 = hasWso2 ? describe : describe.skip;

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.COOKIE_SECRET ||= 'test-cookie-secret';
process.env.FRONTEND_URL ||= 'http://localhost:5173';
const FRONTEND = process.env.FRONTEND_URL;

jest.setTimeout(30000); // real network calls to WSO2

// ── Users kept in memory instead of MongoDB ─────────────────
let users = [];

jest.unstable_mockModule('../src/models/User.js', () => ({
  default: {
    findOne: async (query) => users.find((u) => u.wso2Sub === query.wso2Sub) || null,
    find: (query) => ({
      collation: () => ({ limit: async () => users.filter((u) => u.email === query.email) }),
    }),
    create: async (fields) => {
      const user = { _id: `user-${users.length + 1}`, ...fields };
      users.push(user);
      return user;
    },
  },
}));

// The real login limiter (5 per 15 min) would block the repeated logins in this file.
jest.unstable_mockModule('../src/middleware/rateLimitMiddleware.js', () => ({
  loginLimiter: (req, res, next) => next(),
  registerLimiter: (req, res, next) => next(),
}));

const { default: wso2AuthRoutes } = await import('../src/routes/wso2AuthRoutes.js');
const { getWso2Config } = await import('../src/config/wso2.js');

const app = express();
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use('/api/auth/wso2', wso2AuthRoutes);

// ── Helpers ─────────────────────────────────────────────────
let server;
let api; // e.g. http://127.0.0.1:1234/api/auth/wso2

// GET /login, as the browser does when the user clicks "Sign in with WSO2".
const startLogin = async () => {
  const res = await fetch(`${api}/login`, { redirect: 'manual' });
  const authorizeUrl = new URL(res.headers.get('location'));
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('wso2_tx='));
  return {
    res,
    authorizeUrl,
    setCookie,
    cookie: setCookie.split(';')[0], // what the browser sends back to /callback
    state: authorizeUrl.searchParams.get('state'),
  };
};

// WSO2 sends the browser back to /callback with ?code&state.
const callback = async (params, cookie) => {
  const res = await fetch(`${api}/callback?${new URLSearchParams(params)}`, {
    redirect: 'manual',
    headers: { cookie },
  });
  return {
    location: res.headers.get('location'),
    jwtCookie: res.headers.getSetCookie().find((c) => c.startsWith('jwt=')),
  };
};

// Where WSO2 redirects the browser to for this URL (the redirect is not followed).
const redirectOf = async (url) => {
  const res = await fetch(url, { redirect: 'manual' });
  return new URL(res.headers.get('location'), url);
};

// ═══════════════════════════════════════════════════════════
describeWso2('Sign-in with the real WSO2 Identity Server', () => {
  beforeAll(async () => {
    server = http.createServer(app).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    api = `http://127.0.0.1:${server.address().port}/api/auth/wso2`;

    // The controller logs every rejected sign-in; keep the output readable.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    users = [];
    jest.clearAllMocks();
  });

  test('the endpoints the backend uses are the ones WSO2 publishes', async () => {
    const config = getWso2Config();
    const res = await fetch(`${config.issuer}/.well-known/openid-configuration`);
    const discovery = await res.json();

    expect(discovery.issuer).toBe(config.issuer);
    expect(discovery.authorization_endpoint).toBe(config.authorizeEndpoint);
    expect(discovery.token_endpoint).toBe(config.tokenEndpoint);
    expect(discovery.jwks_uri).toBe(config.jwksUri);
    expect(discovery.userinfo_endpoint).toBe(config.userinfoEndpoint);
    expect(discovery.end_session_endpoint).toBe(config.logoutEndpoint);
  });

  test('/login sends the browser to WSO2 with state, nonce and a PKCE challenge', async () => {
    const login = await startLogin();
    const params = login.authorizeUrl.searchParams;

    expect(login.res.status).toBe(302);
    expect(login.authorizeUrl.origin + login.authorizeUrl.pathname).toBe(getWso2Config().authorizeEndpoint);
    expect(params.get('response_type')).toBe('code');
    expect(params.get('client_id')).toBe(process.env.WSO2_CLIENT_ID);
    expect(params.get('redirect_uri')).toBe(process.env.WSO2_REDIRECT_URI);
    expect(params.get('state')).toBeTruthy();
    expect(params.get('nonce')).toBeTruthy();
    expect(params.get('code_challenge')).toBeTruthy();
    expect(params.get('code_challenge_method')).toBe('S256');

    // The client secret never goes through the browser
    expect(login.authorizeUrl.href).not.toContain(process.env.WSO2_CLIENT_SECRET);

    // This login's state, nonce and PKCE verifier are kept in a signed, httpOnly cookie
    expect(login.setCookie).toMatch(/^wso2_tx=s%3A/); // "s:" = signed by cookie-parser
    expect(login.setCookie).toMatch(/HttpOnly/i);
  });

  test('WSO2 accepts the request and shows its login page', async () => {
    const { authorizeUrl } = await startLogin();

    const next = await redirectOf(authorizeUrl);

    expect(next.pathname).toBe('/authenticationendpoint/login.do');
  });

  test('WSO2 refuses to send the code to a callback URL that is not registered', async () => {
    // e.g. an attacker's copy of the login link that points the code at their own site
    const { authorizeUrl } = await startLogin();
    authorizeUrl.searchParams.set('redirect_uri', 'https://evil.example/callback');

    const next = await redirectOf(authorizeUrl);

    expect(next.pathname).toBe('/authenticationendpoint/oauth2_error.do');
    expect(next.searchParams.get('oauthErrorCode')).toBe('invalid_callback');
  });

  test('a callback with a forged state is rejected, with no session (CSRF)', async () => {
    const login = await startLogin();

    const result = await callback({ code: 'any-code', state: 'forged-state' }, login.cookie);

    expect(result.location).toBe(`${FRONTEND}/login?sso_error=state`);
    expect(result.jwtCookie).toBeUndefined();
  });

  test('a code that WSO2 did not issue is refused by the real token endpoint, with no session', async () => {
    const login = await startLogin();

    const result = await callback({ code: 'made-up-code', state: login.state }, login.cookie);

    expect(result.location).toBe(`${FRONTEND}/login?sso_error=token`);
    expect(result.jwtCookie).toBeUndefined();
    // invalid_grant = WSO2 accepted VaxTrack's client ID and secret, and refused only the code
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('invalid_grant'));
  });
});
