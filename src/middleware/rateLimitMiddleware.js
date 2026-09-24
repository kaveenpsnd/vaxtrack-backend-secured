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

// Limiter for Google sign-in: 10 attempts per IP per 15-minute window.
// Separate from loginLimiter so the two flows don't share one counter.
export const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many Google sign-in attempts from this IP. Please try again after 15 minutes.',
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
