import express from 'express';
import {
    createHospital,
    getAllHospitals,
    getHospitalById,
    updateHospital,
    deleteHospital,
} from '../controllers/hospitalController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST   /api/hospitals       → Create a new hospital (Admin)
router.post('/', protect, adminOnly, createHospital);

// GET    /api/hospitals       → Get all hospitals (Public)
router.get('/', getAllHospitals);

// GET    /api/hospitals/:id   → Get a single hospital (Public)
router.get('/:id', getHospitalById);

// PUT    /api/hospitals/:id   → Update a hospital (Admin)
router.put('/:id', protect, adminOnly, updateHospital);

// DELETE /api/hospitals/:id   → Delete a hospital (Admin)
router.delete('/:id', protect, adminOnly, deleteHospital);

export default router;
