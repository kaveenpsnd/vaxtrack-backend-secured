import express from 'express';
import {
    bookAppointment,
    getMyAppointments,
    getAppointmentById,
    getClinicQueue,
    cancelAppointment,
    updateStatus,
    getAllAppointments,
    updateAppointment,
    deleteAppointment,
} from '../controllers/appointmentController.js';
import { protect, adminOnly, staffOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET    /api/appointments                    → Get all appointments (Admin)
router.get('/', protect, adminOnly, getAllAppointments);

// POST   /api/appointments                    → Book a new appointment (User)
router.post('/', protect, bookAppointment);

// GET    /api/appointments/my                 → Get logged-in user's appointments (User)
router.get('/my', protect, getMyAppointments);

// GET    /api/appointments/clinic/:clinicId   → Get full queue for a clinic (Staff/Admin)
router.get('/clinic/:clinicId', protect, staffOnly, getClinicQueue);

// GET    /api/appointments/:id               → Get a single appointment (User/Staff)
router.get('/:id', protect, getAppointmentById);

// PATCH  /api/appointments/:id/cancel        → Cancel an appointment (User/Staff)
router.patch('/:id/cancel', protect, cancelAppointment);

// PATCH  /api/appointments/:id/status        → Update status to Completed/No-Show (Staff/Admin)
router.patch('/:id/status', protect, staffOnly, updateStatus);

// PUT    /api/appointments/:id               → Update an appointment's status (Staff/Admin)
router.put('/:id', protect, staffOnly, updateAppointment);

// DELETE /api/appointments/:id               → Delete an appointment (Admin)
router.delete('/:id', protect, adminOnly, deleteAppointment);

export default router;
