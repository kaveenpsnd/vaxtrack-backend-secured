import express from 'express';
import { getGoogleClientConfig, googleCallback } from '../controllers/oauthController.js';
import { oauthLimiter } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

// Route 1: Public settings for building the Google authorization URL
// GET /api/auth/google/config
router.get('/google/config', getGoogleClientConfig);

// Route 2: Complete "Sign in with Google" (authorization code + PKCE)
// POST /api/auth/google/callback
router.post('/google/callback', oauthLimiter, googleCallback);

export default router;
