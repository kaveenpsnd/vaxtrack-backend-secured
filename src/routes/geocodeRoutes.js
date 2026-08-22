import express from 'express';
import { geocodeAddress, reverseGeocode } from '../services/geocodingService.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// ──────────────────────────────────────────────
// @desc    Test geocoding endpoint
// @route   POST /api/geocode/test
// @access  Admin (for testing)
// ──────────────────────────────────────────────
router.post('/test', protect, adminOnly, async (req, res) => {
    try {
        const { address, city } = req.body;

        if (!address) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an address to geocode',
            });
        }

        const result = await geocodeAddress(address, city, 'Sri Lanka');

        res.status(200).json({
            success: true,
            message: 'Geocoding successful',
            data: result,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Geocoding failed',
            error: error.message,
        });
    }
});

// ──────────────────────────────────────────────
// @desc    Test reverse geocoding endpoint
// @route   POST /api/geocode/reverse
// @access  Admin (for testing)
// ──────────────────────────────────────────────
router.post('/reverse', protect, adminOnly, async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Please provide latitude and longitude',
            });
        }

        const address = await reverseGeocode(latitude, longitude);

        res.status(200).json({
            success: true,
            message: 'Reverse geocoding successful',
            data: { address },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Reverse geocoding failed',
            error: error.message,
        });
    }
});

export default router;
