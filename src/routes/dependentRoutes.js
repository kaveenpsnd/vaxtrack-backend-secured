import express from 'express';
import {
    addDependent,
    deleteDependent,
    getDependentById,
    getDependentsByParent,
    updateDependent,
} from '../controllers/dependentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protect);

// POST /api/users/dependents
router.post('/', addDependent);

// GET /api/users/dependents
router.get('/', getDependentsByParent);

// GET /api/users/dependents/:id
router.get('/:id', getDependentById);

// PUT /api/users/dependents/:id
router.put('/:id', updateDependent);

// DELETE /api/users/dependents/:id
router.delete('/:id', deleteDependent);

export default router;
