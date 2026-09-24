import User from '../models/User.js';
import { generateToken, setTokenCookie } from './authController.js';
import {
  GOOGLE_SCOPE,
  GoogleAuthError,
  getGoogleConfig,
  isGoogleAuthConfigured,
  verifyGoogleSignIn,
} from '../services/googleAuthService.js';

// RFC 7636: a PKCE code_verifier is 43–128 characters from the unreserved set.
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

const isNonEmptyString = (value, maxLength) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;

const notConfigured = (res) =>
  res.status(503).json({
    success: false,
    message: 'Google sign-in is not configured on this server',
  });

// Issue the same session as POST /api/users/login: an httpOnly cookie, with
// the same response body shape. The role always comes from our database.
const sendSession = (res, statusCode, user) => {
  setTokenCookie(res, generateToken(user._id, user.role));

  return res.status(statusCode).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    profilePicture: user.profilePicture,
  });
};

// ──────────────────────────────────────────────
// @desc    Public settings the frontend needs to build the Google auth URL
// @route   GET /api/auth/google/config
// @access  Public
// ──────────────────────────────────────────────
const getGoogleClientConfig = (req, res) => {
  if (!isGoogleAuthConfigured()) return notConfigured(res);

  const { clientId, redirectUri } = getGoogleConfig();
  // The client ID and redirect URI are public by design; the secret is not sent.
  res.status(200).json({ clientId, redirectUri, scope: GOOGLE_SCOPE });
};

// ──────────────────────────────────────────────
// @desc    Complete "Sign in with Google": redeem the code, verify the ID
//          token, then sign in, link or register the patient account
// @route   POST /api/auth/google/callback
// @access  Public
// ──────────────────────────────────────────────
const googleCallback = async (req, res) => {
  if (!isGoogleAuthConfigured()) return notConfigured(res);

  // SECURITY: `role` is intentionally NOT read from req.body. A Google
  // sign-in can only ever produce a Public session.
  const { code, codeVerifier, nonce, nic, phone, address } = req.body || {};

  if (
    !isNonEmptyString(code, 2048) ||
    typeof codeVerifier !== 'string' ||
    !CODE_VERIFIER_PATTERN.test(codeVerifier) ||
    !isNonEmptyString(nonce, 512) ||
    nonce.length < 16
  ) {
    return res.status(400).json({
      success: false,
      message: 'code, a valid PKCE codeVerifier and a nonce (16+ characters) are required',
    });
  }

  // 1. Redeem the code and verify the ID token
  let identity;
  try {
    identity = await verifyGoogleSignIn({ code, codeVerifier, nonce });
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      console.error('Google sign-in rejected:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Google sign-in failed. Please try again.',
      });
    }
    throw error;
  }

  // 2. Find the account: first by Google ID, then by the Google-verified email
  let user = await User.findOne({ googleId: identity.googleId });

  if (!user) {
    // Registration never normalised email case, so match case-insensitively
    user = await User.findOne({ email: identity.email }).collation({ locale: 'en', strength: 2 });

    if (user && user.googleId && user.googleId !== identity.googleId) {
      return res.status(409).json({
        success: false,
        message: 'This email is already linked to a different Google account.',
      });
    }
  }

  if (user) {
    // Google sign-in is for patient accounts only. Staff and admins keep using
    // their password, so an OAuth session can never carry an elevated role.
    if (user.role !== 'Public') {
      return res.status(403).json({
        success: false,
        message: 'Staff and admin accounts must sign in with their email and password.',
      });
    }

    // Link on first Google sign-in
    if (!user.googleId) {
      user.googleId = identity.googleId;
      await user.save();
    }

    return sendSession(res, 200, user);
  }

  // 3. New patient: VaxTrack needs a NIC and phone number that Google doesn't
  //    provide. The code is single-use, so the frontend collects them and
  //    restarts the Google flow.
  if (!isNonEmptyString(nic, 20) || !isNonEmptyString(phone, 20)) {
    return res.status(404).json({
      success: false,
      needsRegistration: true,
      message: 'No VaxTrack account is linked to this Google account. Provide your NIC and phone number to register.',
      profile: { name: identity.name, email: identity.email },
    });
  }

  if (address !== undefined && !isNonEmptyString(address, 300)) {
    return res.status(400).json({ success: false, message: 'Invalid address' });
  }

  if (await User.findOne({ nic: nic.trim() })) {
    return res.status(409).json({
      success: false,
      message: 'An account with this NIC already exists. Sign in with your email and password.',
    });
  }

  try {
    const newUser = await User.create({
      name: identity.name,
      email: identity.email,
      googleId: identity.googleId,
      role: 'Public', // Forced server-side; never taken from Google or the request
      nic: nic.trim(),
      phone: phone.trim(),
      address: address?.trim(),
    });

    return sendSession(res, 201, newUser);
  } catch (error) {
    // Two sign-ins racing for the same email, NIC or Google ID
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with these details already exists.',
      });
    }
    throw error;
  }
};

export { getGoogleClientConfig, googleCallback };
