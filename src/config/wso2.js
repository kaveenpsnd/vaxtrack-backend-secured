// WSO2 Identity Server (OpenID Connect) settings.
//
// Everything is read from environment variables on each call rather than at
// import time: server.js runs dotenv.config() after its imports are evaluated.

import { createRemoteJWKSet } from 'jose';

const REQUIRED_ENV_VARS = [
  'WSO2_BASE',
  'WSO2_CLIENT_ID',
  'WSO2_CLIENT_SECRET',
  'WSO2_REDIRECT_URI',
  'FRONTEND_URL',
  'COOKIE_SECRET',
];

const stripTrailingSlash = (value) => (value.endsWith('/') ? value.slice(0, -1) : value);

/**
 * Returns the WSO2 client settings and endpoint URLs.
 * Endpoints match the discovery document of our WSO2 IS 7.1 tenant.
 *
 * @returns {object} WSO2 configuration
 * @throws {Error} If a required environment variable is missing (names only, never values)
 */
export const getWso2Config = () => {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing WSO2 SSO configuration: ${missing.join(', ')}`);
  }

  const base = stripTrailingSlash(process.env.WSO2_BASE);

  return {
    clientId: process.env.WSO2_CLIENT_ID,
    clientSecret: process.env.WSO2_CLIENT_SECRET,
    redirectUri: process.env.WSO2_REDIRECT_URI,
    frontendUrl: stripTrailingSlash(process.env.FRONTEND_URL),
    authorizeEndpoint: `${base}/oauth2/authorize`,
    tokenEndpoint: `${base}/oauth2/token`,
    jwksUri: `${base}/oauth2/jwks`,
    userinfoEndpoint: `${base}/oauth2/userinfo`,
    issuer: `${base}/oauth2/token`,
    logoutEndpoint: `${base}/oidc/logout`,
  };
};

// One JWKS instance per URI so the fetched signing keys are cached between logins.
// jose refetches automatically when an ID token names a key id it has not seen.
let cachedJwks = null;
let cachedJwksUri = null;

/**
 * @param {string} jwksUri - WSO2 JWKS endpoint
 * @returns {Function} Key resolver for jose's jwtVerify
 */
export const getJwks = (jwksUri) => {
  if (!cachedJwks || cachedJwksUri !== jwksUri) {
    cachedJwks = createRemoteJWKSet(new URL(jwksUri));
    cachedJwksUri = jwksUri;
  }
  return cachedJwks;
};
