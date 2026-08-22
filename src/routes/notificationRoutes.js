import express from 'express';
import { triggerNotification } from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Route to trigger a notification email
// Requires user to be authenticated (protect middleware)
router.post('/send', protect, triggerNotification);

export default router;
