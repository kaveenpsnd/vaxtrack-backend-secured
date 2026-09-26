import crypto from "node:crypto";
import { jwtVerify } from "jose";
import User from "../models/User.js";
import { getJwks, getWso2Config } from "../config/wso2.js";
import { clearTokenCookie, generateToken, setTokenCookie } from "./authController.js";

// Short-lived cookie holding { state, nonce, verifier } between /login and /callback.
const TX_COOKIE = "wso2_tx";
const TX_COOKIE_PATH = "/api/auth/wso2";
const TX_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

const TOKEN_REQUEST_TIMEOUT_MS = 10 * 1000; // token and userinfo requests
const CLOCK_TOLERANCE_SECONDS = 30; // allowed clock skew between us and WSO2

// SECURITY: every account created through SSO gets this role. It is never read
// from ID token claims, query parameters or the request body.
const SSO_DEFAULT_ROLE = "Public";

// A failed SSO step. `code` is the short, non-sensitive value sent to the
// frontend as ?sso_error=<code>; `message` is logged server-side only.
class SsoError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const randomToken = () => crypto.randomBytes(32).toString("base64url");

const pkceChallenge = (verifier) =>
  crypto.createHash("sha256").update(verifier).digest("base64url");

const txCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax", // sent on the top-level redirect back from WSO2
  secure: process.env.NODE_ENV === "production",
  path: TX_COOKIE_PATH,
});

// Constant-time string comparison; false for non-strings (e.g. repeated query params).
const safeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

// Only log values from the query string or WSO2 if they look like OAuth error codes.
const safeLogValue = (value) =>
  typeof value === "string" && /^[a-z_]{1,64}$/.test(value) ? value : "unrecognised";

// TEMP-DEBUG (remove after the missing-email investigation): dev-only diagnostics.
// Callers must pass claim NAMES and scope strings only — never tokens, codes or emails.
const debugLog = (message) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[wso2][debug] ${message.replace(/[^\x20-\x7E]/g, "?")}`);
  }
};

const isValidTransaction = (tx) => {
  if (!tx || typeof tx !== "object") return false;
  const { state, nonce, verifier, iat } = tx;
  if (![state, nonce, verifier].every((v) => typeof v === "string" && v.length > 0)) return false;
  // The browser drops the cookie after 5 minutes; enforce it server-side too.
  const age = Date.now() - iat;
  return Number.isFinite(iat) && age >= 0 && age <= TX_MAX_AGE_MS;
};

// @desc    Start WSO2 single sign-on (Authorization Code + PKCE)
// @route   GET /api/auth/wso2/login
// @access  Public
const wso2Login = (req, res) => {
  let config;
  try {
    config = getWso2Config();
  } catch (error) {
    console.error(`[wso2] ${error.message}`);
    return res.status(500).json({ success: false, message: "Single sign-on is not configured" });
  }

  const state = randomToken(); // CSRF protection for the callback
  const nonce = randomToken(); // binds the ID token to this login attempt
  const verifier = randomToken(); // PKCE code_verifier

  res.cookie(
    TX_COOKIE,
    { state, nonce, verifier, iat: Date.now() },
    { ...txCookieOptions(), signed: true, maxAge: TX_MAX_AGE_MS },
  );

  const authorizeUrl = new URL(config.authorizeEndpoint);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();

  return res.redirect(authorizeUrl.toString());
};

// Exchanges the authorization code for tokens.
// Returns { idToken, accessToken, scope }; accessToken is only used for userinfo.
const exchangeCode = async (code, verifier, config) => {
  const credentials = Buffer.from(
    `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`,
  ).toString("base64");

  let response;
  try {
    response = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        code_verifier: verifier,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new SsoError("token", `token request failed (${error.name})`);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body; handled below.
  }

  if (!response.ok) {
    // Log the status and OAuth error code only — never the response body.
    throw new SsoError(
      "token",
      `token endpoint returned ${response.status} (${safeLogValue(body?.error)})`,
    );
  }
  if (!body || typeof body.id_token !== "string") {
    throw new SsoError("token", "token response has no id_token");
  }

  return {
    idToken: body.id_token,
    accessToken: typeof body.access_token === "string" ? body.access_token : null,
    scope: typeof body.scope === "string" ? body.scope : null,
  };
};

// Fetches the OIDC userinfo claims with the access token from the same token response.
const fetchUserinfo = async (accessToken, config) => {
  if (!accessToken) {
    throw new SsoError("token", "token response has no access_token for userinfo");
  }

  let response;
  try {
    response = await fetch(config.userinfoEndpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new SsoError("token", `userinfo request failed (${error.name})`);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (e.g. a signed userinfo JWT, which we do not request); handled below.
  }

  if (!response.ok) {
    // Status and OAuth error code only — never the response body.
    throw new SsoError(
      "token",
      `userinfo endpoint returned ${response.status} (${safeLogValue(body?.error)})`,
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SsoError("token", "userinfo response is not a JSON object");
  }

  return body;
};

// When the verified ID token has no email, fill email (and names) from userinfo.
// Returns the claims used for account matching; the ID token payload is not modified.
const resolveClaims = async (payload, accessToken, config) => {
  if (typeof payload.email === "string" && payload.email.trim()) {
    return payload;
  }

  const userinfo = await fetchUserinfo(accessToken, config);

  // OIDC Core 5.3.2: userinfo is only about this user if its sub exactly
  // matches the verified ID token's sub. Otherwise none of it may be used.
  if (typeof userinfo.sub !== "string" || userinfo.sub !== payload.sub) {
    throw new SsoError("verify", "userinfo sub is missing or does not match id_token sub");
  }

  debugLog(`userinfo claim names: ${Object.keys(userinfo).join(", ")}`);

  const claims = {
    ...payload,
    // email and email_verified always come from the same source.
    email: userinfo.email,
    email_verified: userinfo.email_verified,
  };
  for (const name of ["given_name", "family_name"]) {
    if (claims[name] === undefined) claims[name] = userinfo[name];
  }
  return claims;
};

// Verifies signature (RS256 via WSO2's JWKS), issuer, audience and expiry.
const verifyIdToken = async (idToken, config) => {
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, getJwks(config.jwksUri), {
      issuer: config.issuer,
      audience: config.clientId,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat"],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    }));
  } catch (error) {
    throw new SsoError("verify", `id_token verification failed (${error.code || error.name})`);
  }

  // `sub` is used in a database query, so it must be a plain string.
  if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 255) {
    throw new SsoError("verify", "id_token sub is not a valid string");
  }

  // OIDC Core 3.1.3.7: with several audiences, azp must be us; if present it must be us.
  const multipleAudiences = Array.isArray(payload.aud) && payload.aud.length > 1;
  if ((multipleAudiences || payload.azp !== undefined) && payload.azp !== config.clientId) {
    throw new SsoError("verify", "id_token azp does not match client_id");
  }

  return payload;
};

const buildName = (payload, email) => {
  const parts = [payload.given_name, payload.family_name]
    .filter((part) => typeof part === "string" && part.trim())
    .map((part) => part.trim());
  const name = parts.join(" ") || (typeof payload.name === "string" && payload.name.trim()) || email.split("@")[0];
  return name.slice(0, 100);
};

// Finds the VaxTrack user for the verified identity, linking or creating as needed.
// `payload` is the verified ID token, plus userinfo email/name claims when resolveClaims added them.
const findOrCreateUser = async (payload, email) => {
  const sub = payload.sub;

  // 1. Already signed in with this WSO2 identity before.
  const linkedUser = await User.findOne({ wso2Sub: sub });
  if (linkedUser) return linkedUser;

  // 2. An existing account with the same email. Stored emails were never
  //    normalised, so match exactly but case-insensitively.
  const matches = await User.find({ email })
    .collation({ locale: "en", strength: 2 })
    .limit(2);

  if (matches.length > 1) {
    throw new SsoError("account", "several accounts match this email");
  }

  if (matches.length === 1) {
    const existingUser = matches[0];

    if (existingUser.wso2Sub) {
      throw new SsoError("account", "account is already linked to a different WSO2 identity");
    }
    // Linking takes over an existing (possibly staff/admin) account, so WSO2
    // must vouch that the person signing in owns this email address.
    if (payload.email_verified !== true && payload.email_verified !== "true") {
      throw new SsoError("unverified", "email not verified by WSO2; refusing to link account");
    }

    // Only set wso2Sub — role and every other field stay untouched. The
    // $exists guard makes a concurrent link attempt fail instead of overwrite.
    const result = await User.updateOne(
      { _id: existingUser._id, wso2Sub: { $exists: false } },
      { $set: { wso2Sub: sub } },
    );
    if (result.matchedCount !== 1) {
      throw new SsoError("account", "account was linked concurrently");
    }
    existingUser.wso2Sub = sub;
    return existingUser;
  }

  // 3. First sign-in: create a Public account. Fields are listed explicitly;
  //    no claim is copied wholesale into the document.
  try {
    return await User.create({
      name: buildName(payload, email),
      email,
      role: SSO_DEFAULT_ROLE,
      authProvider: "wso2",
      wso2Sub: sub,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new SsoError("account", "duplicate key while creating SSO user");
    }
    throw error;
  }
};

// @desc    WSO2 redirects here with ?code&state (or ?error)
// @route   GET /api/auth/wso2/callback
// @access  Public
const wso2Callback = async (req, res) => {
  const tx = req.signedCookies?.[TX_COOKIE]; // false if the signature is invalid

  // One-time use: clear the transaction cookie before anything else, whatever the outcome.
  res.clearCookie(TX_COOKIE, txCookieOptions());

  let config;
  try {
    config = getWso2Config();
  } catch (error) {
    console.error(`[wso2] ${error.message}`);
    return res.status(500).json({ success: false, message: "Single sign-on is not configured" });
  }

  try {
    // 1. CSRF: the state must match the one we issued to this browser.
    if (!isValidTransaction(tx)) {
      throw new SsoError("state", "transaction cookie missing, tampered or expired");
    }
    if (!safeEqual(req.query.state, tx.state)) {
      throw new SsoError("state", "state mismatch");
    }

    // 2. The user cancelled or WSO2 refused the request.
    if (req.query.error !== undefined) {
      throw new SsoError("denied", `authorization error (${safeLogValue(req.query.error)})`);
    }

    const { code } = req.query;
    if (typeof code !== "string" || code.length === 0) {
      throw new SsoError("token", "authorization code missing");
    }

    // 3. Code → tokens (PKCE verifier proves we started this flow).
    const { idToken, accessToken, scope } = await exchangeCode(code, tx.verifier, config);
    debugLog(`token endpoint scope: ${scope ?? "(none)"}`);

    // 4. Signature, iss, aud, exp; then nonce binds the token to this login.
    const payload = await verifyIdToken(idToken, config);
    debugLog(`id_token claim names: ${Object.keys(payload).join(", ")}`);
    if (!safeEqual(payload.nonce, tx.nonce)) {
      throw new SsoError("nonce", "nonce mismatch");
    }

    // 5. Email is how we match accounts, so it is mandatory. If the ID token
    //    lacks it, fall back to userinfo (bound to the same sub).
    const claims = await resolveClaims(payload, accessToken, config);
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !email.includes("@")) {
      throw new SsoError("email", "neither id_token nor userinfo has a usable email claim");
    }

    // 6. Issue our own JWT exactly as password login does.
    const user = await findOrCreateUser(claims, email);
    setTokenCookie(res, generateToken(user._id, user.role));

    return res.redirect(`${config.frontendUrl}/oauth/callback`);
  } catch (error) {
    if (error instanceof SsoError) {
      console.warn(`[wso2] SSO login failed: ${error.code} (${error.message})`);
      return res.redirect(`${config.frontendUrl}/login?sso_error=${error.code}`);
    }
    console.error(`[wso2] unexpected error during SSO callback: ${error.name}: ${error.message}`);
    return res.redirect(`${config.frontendUrl}/login?sso_error=server`);
  }
};

// @desc    Log out of VaxTrack and return the WSO2 end-session URL
// @route   POST /api/auth/wso2/logout
// @access  Public
const wso2Logout = (req, res) => {
  clearTokenCookie(res);

  let config;
  try {
    config = getWso2Config();
  } catch (error) {
    console.error(`[wso2] ${error.message}`);
    return res.status(500).json({ success: false, message: "Single sign-on is not configured" });
  }

  const logoutUrl = new URL(config.logoutEndpoint);
  logoutUrl.search = new URLSearchParams({
    client_id: config.clientId,
    post_logout_redirect_uri: `${config.frontendUrl}/login`,
  }).toString();

  return res.status(200).json({ success: true, logoutUrl: logoutUrl.toString() });
};

export { wso2Login, wso2Callback, wso2Logout };
