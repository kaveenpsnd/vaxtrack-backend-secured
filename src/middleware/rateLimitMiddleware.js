import rateLimit from 'express-rate-limit';

// Strict limiter for login: 5 attempts per IP per 15-minute window.
// Mitigates password brute-forcing on POST /api/users/login.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true, // send RateLimit-* headers
  legacyHeaders: false, // disable X-RateLimit-* headers
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
  },
});

// Lenient limiter for registration: 20 accounts per IP per hour.
// Mitigates mass account creation on POST /api/users.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many accounts created from this IP. Please try again after an hour.',
  },
});

// Limiter for the WSO2 SSO redirects (GET /api/auth/wso2/login and /callback).
// Password guessing does not happen here (WSO2 checks the password), and one
// sign-in makes two requests, so the strict loginLimiter would lock users out
// after a couple of logins. Skipped outside production to keep local dev smooth.
export const ssoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: {
    success: false,
    message: 'Too many sign-in attempts from this IP. Please try again after 15 minutes.',
  },
});
