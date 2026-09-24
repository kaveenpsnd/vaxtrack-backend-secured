import { OAuth2Client } from 'google-auth-library';

// ──────────────────────────────────────────────
// "Sign in with Google" — OpenID Connect authorization code flow with PKCE.
//
// The frontend sends Google to the consent screen and receives the
// authorization code on its callback page. It forwards that code, the PKCE
// code_verifier and the nonce here. We redeem the code with our client
// secret, then verify the ID token Google returns before trusting any of it.
//
// Required env vars:
//   GOOGLE_CLIENT_ID      OAuth client ID (Google Cloud Console)
//   GOOGLE_CLIENT_SECRET  OAuth client secret — server-side only
//   GOOGLE_REDIRECT_URI   The frontend callback URL registered with Google
// ──────────────────────────────────────────────

export const GOOGLE_SCOPE = 'openid email profile';

// Any reason to reject a sign-in attempt. The controller logs the message and
// returns a generic 401, so Google's error details never reach the client.
export class GoogleAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

// Read lazily (not at import time) so dotenv.config() has already run.
export const getGoogleConfig = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

export const isGoogleAuthConfigured = () => {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  return Boolean(clientId && clientSecret && redirectUri);
};

/**
 * Redeems an authorization code and returns the verified Google identity.
 *
 * @param {object} params
 * @param {string} params.code - Authorization code from Google's redirect
 * @param {string} params.codeVerifier - PKCE verifier the frontend generated
 * @param {string} params.nonce - Nonce the frontend sent in the auth request
 * @returns {Promise<{googleId: string, email: string, name: string}>}
 * @throws {GoogleAuthError} if the code or the ID token is not acceptable
 */
export const verifyGoogleSignIn = async ({ code, codeVerifier, nonce }) => {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri });

  // 1. Exchange the code at Google's token endpoint. The PKCE verifier proves
  //    this request comes from the browser that started the flow, and
  //    redirect_uri comes from our config, never from the request.
  let tokens;
  try {
    ({ tokens } = await client.getToken({
      code,
      codeVerifier,
      redirect_uri: redirectUri,
    }));
  } catch (error) {
    throw new GoogleAuthError(`Code exchange failed: ${error.message}`);
  }

  if (!tokens || !tokens.id_token) {
    throw new GoogleAuthError('Google did not return an ID token');
  }

  // 2. Verify the ID token: signature against Google's published keys, `aud`
  //    must be our client ID, `iss` must be Google, and `exp` must not have
  //    passed. google-auth-library performs all four checks.
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch (error) {
    throw new GoogleAuthError(`ID token verification failed: ${error.message}`);
  }

  if (!payload || !payload.sub) {
    throw new GoogleAuthError('ID token has no subject');
  }

  // 3. Claims the library does not check for us.
  // The nonce ties this ID token to the sign-in attempt the frontend started.
  if (payload.nonce !== nonce) {
    throw new GoogleAuthError('ID token nonce does not match the request');
  }

  // Only a Google-verified email may be used to find or link an account.
  if (payload.email_verified !== true || !payload.email) {
    throw new GoogleAuthError('Google account email is not verified');
  }

  const email = payload.email.toLowerCase();

  return {
    googleId: payload.sub,
    email,
    name: payload.name || email.split('@')[0],
  };
};
