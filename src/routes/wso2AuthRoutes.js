import express from 'express';
import { wso2Callback, wso2Login, wso2Logout } from '../controllers/wso2AuthController.js';
import { ssoLimiter } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

// Route 1: Start SSO — redirects the browser to WSO2
// GET /api/auth/wso2/login
router.get('/login', ssoLimiter, wso2Login);

// Route 2: WSO2 redirects back here with the authorization code
// GET /api/auth/wso2/callback
router.get('/callback', ssoLimiter, wso2Callback);

// Route 3: Logout — clears our cookie and returns the WSO2 end-session URL
// POST /api/auth/wso2/logout
router.post('/logout', wso2Logout);

export default router;
