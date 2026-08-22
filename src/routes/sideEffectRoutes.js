import express from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import {
    reportSideEffect,
    getMySideEffects,
    getSideEffectById,
    updateSideEffect,
    deleteSideEffect,
    getAllSideEffects,
} from '../controllers/sideEffectController.js';

const router = express.Router();

// Route: Report a side effect for a vaccination
// POST /api/side-effects
router.post('/', protect, reportSideEffect);

// Route: Get my reported side effects
// GET /api/side-effects/my
router.get('/my', protect, getMySideEffects);

// Route: Get ALL side effects (Admin monitoring)
// GET /api/side-effects
router.get('/', protect, adminOnly, getAllSideEffects);

// Route: Get a single side effect by ID
// GET /api/side-effects/:id
router.get('/:id', protect, getSideEffectById);

// Route: Update a side effect report (symptoms/severity only)
// PUT /api/side-effects/:id
router.put('/:id', protect, updateSideEffect);

// Route: Delete a side effect report
// DELETE /api/side-effects/:id
router.delete('/:id', protect, deleteSideEffect);

export default router;
