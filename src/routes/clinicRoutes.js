import express from 'express';
import {
    createClinic,
    getAllClinics,
    getClinicsByHospital,
    getClinicById,
    updateClinic,
    updateClinicCapacity,
    deleteClinic,
} from '../controllers/clinicController.js';
import { protect, staffOnly, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST   /api/clinics                      → Create a new clinic session (Staff/Admin)
router.post('/', protect, staffOnly, createClinic);

// GET    /api/clinics                      → Get all clinics with optional filters (Public)
router.get('/', getAllClinics);

// GET    /api/clinics/hospital/:hospitalId → Get all clinics for a hospital (Public)
router.get('/hospital/:hospitalId', getClinicsByHospital);

// GET    /api/clinics/:id                  → Get a single clinic session (Public)
router.get('/:id', getClinicById);

// PUT    /api/clinics/:id                  → Update full clinic details (Staff/Admin)
router.put('/:id', protect, staffOnly, updateClinic);

// PATCH  /api/clinics/:id/capacity         → Update clinic capacity (Staff/Admin)
router.patch('/:id/capacity', protect, staffOnly, updateClinicCapacity);

// DELETE /api/clinics/:id                  → Delete a clinic session (Admin)
router.delete('/:id', protect, adminOnly, deleteClinic);

export default router;
