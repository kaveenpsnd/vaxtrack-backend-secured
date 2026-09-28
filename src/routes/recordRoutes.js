import express from 'express';
import { protect, staffOnly } from '../middleware/authMiddleware.js';
import {
    createRecord,
    getMyRecords,
    getHistory,
    getDueRecords,
    getRecordById,
    updateRecord,
    deleteRecord,
    getAllRecords,
} from '../controllers/recordController.js';

const router = express.Router();

// Route: Add a new vaccination record
// POST /api/records
// Staff/Admin only. `protect` only proves the caller is logged in; `staffOnly`
// is what stops a Public user from forging vaccination records.
router.post('/', protect, staffOnly, createRecord);

// Route: Get logged-in user's vaccination history
// GET /api/records/my
router.get('/my', protect, getMyRecords);

// Route: Get full history for Self AND Dependents
// GET /api/records/history
router.get('/history', protect, getHistory);

// Route: Get upcoming/due vaccinations
// GET /api/records/due
router.get('/due', protect, getDueRecords);

// Route: Get ALL records (Staff/Admin monitoring)
// GET /api/records
router.get('/', protect, staffOnly, getAllRecords);

// Route: Get a single record by ID
// GET /api/records/:id
router.get('/:id', protect, getRecordById);

// Route: Update a vaccination record
// PUT /api/records/:id
router.put('/:id', protect, staffOnly, updateRecord);

// Route: Delete a vaccination record (cascades to SideEffects)
// DELETE /api/records/:id
router.delete('/:id', protect, staffOnly, deleteRecord);

export default router;
