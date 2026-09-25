import express from 'express';
import { registerUser, authUser, searchUsers, updateUserProfile } from '../controllers/authController.js';
import { protect, staffOnly } from '../middleware/authMiddleware.js';
import upload, { validateImageFile } from '../middleware/uploadMiddleware.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

// Route 1: Registration
// POST /api/users
router.post('/', registerLimiter, registerUser);

// Route 2: Login
// POST /api/users/login
router.post('/login', loginLimiter, authUser);

// Route 3: Get My Profile (Protected)
// GET /api/users/profile
router.get('/profile', protect, (req, res) => {
  res.json(req.user);
});

// Route 4: Update My Profile (Protected)
// PUT /api/users/profile
router.put('/profile', protect, upload.single('profilePicture'), validateImageFile, updateUserProfile);

// Route 5: Search patients by NIC / name / ID (Staff/Admin only)
// GET /api/users/search?q=<query>
router.get('/search', protect, staffOnly, searchUsers);

export default router;