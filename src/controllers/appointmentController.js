import Appointment from '../models/Appointment.js';
import Clinic from '../models/Clinic.js';
import { sendNotificationAlert } from '../services/emailService.js';

// ──────────────────────────────────────────────
// @desc    Book an appointment for a clinic
// @route   POST /api/appointments
// @access  Private (User)
// ──────────────────────────────────────────────
const bookAppointment = async (req, res) => {
    try {
        const { clinicId, dependentId } = req.body;

        // ── Input Validation ──
        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: 'clinicId is required',
            });
        }

        // Verify the clinic exists
        const clinic = await Clinic.findById(clinicId);
        if (!clinic) {
            return res.status(404).json({
                success: false,
                message: 'Clinic not found',
            });
        }

        // ── Step 2: Quota Check ──
        // Reject the booking if the clinic has no seats left
        if (clinic.bookedCount >= clinic.capacity) {
            return res.status(409).json({
                success: false,
                message: 'This clinic session is fully booked. No seats remaining.',
                available: 0,
            });
        }

        // ── Step 3: Double-Booking Guard ──
        // Prevent the same patient (user or dependent) from holding more than one
        // active booking in the same clinic session.
        const alreadyBooked = await Appointment.hasActiveBooking(
            clinicId,
            req.user._id,
            dependentId || null
        );
        if (alreadyBooked) {
            return res.status(409).json({
                success: false,
                message: dependentId
                    ? 'This dependent already has an active booking for this clinic session.'
                    : 'You already have an active booking for this clinic session.',
            });
        }

        // Create the appointment

        // queueNumber is auto-assigned by the pre-save hook in Appointment.js
        const appointment = await Appointment.create({
            clinicId,
            userId: req.user._id,
            dependentId: dependentId || null,
        });

        // ── Step 2: Increment Seat Counter ──
        // Increment after successful create so a failed create doesn't waste a seat
        clinic.bookedCount += 1;
        await clinic.save();

        // ── Step 6a: QR Code Generation ──
        // Fail-safe: a downed QR API never cancels a valid booking.
        try {
            const qrPayload = JSON.stringify({
                appointmentId: appointment._id.toString(),
                queueNumber:   appointment.queueNumber,
                clinicId:      clinicId,
                patientId:     req.user._id.toString(),
            });
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrPayload)}&size=200x200&format=png`;
            appointment.qrCodeUrl = qrUrl;
            await appointment.save();
        } catch (qrError) {
            console.warn(
                `[QR] Failed to generate QR code for appointment ${appointment._id}:`,
                qrError.message
            );
            // qrCodeUrl stays null — booking is still valid
        }

        // Populate for a clean response
        await appointment.populate('clinicId', 'date startTime endTime vaccineType hospital');
        if (appointment.dependentId) {
            await appointment.populate('dependentId', 'name relationship');
        }

        // ── Trigger Email Alert ──
        try {
            const formattedDate = new Date(appointment.clinicId.date).toLocaleDateString();
            const dependentStr = appointment.dependentId ? appointment.dependentId.name : 'yourself';
            const emailSubject = `Appointment Confirmed: ${appointment.clinicId.vaccineType}`;
            const emailMessage = `Your appointment for the <strong>${appointment.clinicId.vaccineType}</strong> vaccine for <strong>${dependentStr}</strong> has been successfully booked.<br><br><strong>Date:</strong> ${formattedDate}<br><strong>Time:</strong> ${appointment.clinicId.startTime} - ${appointment.clinicId.endTime}<br><strong>Queue Number:</strong> ${appointment.queueNumber}<br><br>Please arrive 10 minutes early.`;

            await sendNotificationAlert({
                patientEmail: req.user.email,
                patientName: req.user.name,
                subject: emailSubject,
                message: emailMessage
            });
        } catch (emailErr) {
            console.error('Failed to send appointment confirmation email:', emailErr.message);
            // We do NOT block booking success if email fails
        }

        res.status(201).json({
            success: true,
            message: 'Appointment booked successfully',
            data: appointment,
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format provided',
            });
        }

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: messages,
            });
        }

        console.error('Error booking appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while booking appointment',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get all appointments for the logged-in user
// @route   GET /api/appointments/my
// @access  Private (User)
// ──────────────────────────────────────────────
const getMyAppointments = async (req, res) => {
    try {
        const appointments = await Appointment.findByUser(req.user._id);

        res.status(200).json({
            success: true,
            count: appointments.length,
            data: appointments,
        });
    } catch (error) {
        console.error('Error fetching user appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching appointments',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get a single appointment by ID
// @route   GET /api/appointments/:id
// @access  Private (User / Staff / Admin)
// ──────────────────────────────────────────────
const getAppointmentById = async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id)
            .populate('clinicId', 'date startTime endTime vaccineType hospital')
            .populate('userId', 'name email phone')
            .populate('dependentId', 'name relationship dateOfBirth');

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found',
            });
        }

        // ── Step 4: RBAC ──
        // req.user is populated by protect middleware (Mongoose doc) → use _id
        const isStaffOrAdmin = ['HospitalStaff', 'Admin'].includes(req.user.role);
        const isOwner = appointment.userId.toString() === req.user._id.toString();

        if (!isOwner && !isStaffOrAdmin) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorised to view this appointment',
            });
        }

        res.status(200).json({
            success: true,
            data: appointment,
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid appointment ID format',
            });
        }

        console.error('Error fetching appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching appointment',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get the full queue for a clinic session
// @route   GET /api/appointments/clinic/:clinicId
// @access  Private (Staff / Admin)
// ──────────────────────────────────────────────
const getClinicQueue = async (req, res) => {
    try {
        const { clinicId } = req.params;

        // Verify the clinic exists
        const clinic = await Clinic.findById(clinicId);
        if (!clinic) {
            return res.status(404).json({
                success: false,
                message: 'Clinic not found',
            });
        }

        const appointments = await Appointment.findByClinic(clinicId);

        res.status(200).json({
            success: true,
            count: appointments.length,
            data: appointments,
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid clinic ID format',
            });
        }

        console.error('Error fetching clinic queue:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching clinic queue',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Cancel an appointment
// @route   PATCH /api/appointments/:id/cancel
// @access  Private (User / Staff / Admin)
// ──────────────────────────────────────────────
const cancelAppointment = async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found',
            });
        }

        // ── Step 5: Status Transition Guard ──
        // Only a Pending appointment can be cancelled.
        if (appointment.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel an appointment with status "${appointment.status}". Only Pending appointments can be cancelled.`,
            });
        }

        // Use the instance method defined in the model
        await appointment.cancel();


        // ── Step 2: Decrement Seat Counter ──
        // Only release the seat if the appointment was Pending (already enforced
        // by the cancel() instance method above — it throws for non-Pending).
        const clinic = await Clinic.findById(appointment.clinicId);
        if (clinic && clinic.bookedCount > 0) {
            clinic.bookedCount -= 1;
            await clinic.save();
        }

        res.status(200).json({
            success: true,
            message: 'Appointment cancelled successfully',
            data: appointment,
        });
    } catch (error) {
        // Catch the "cannot cancel" error thrown by the instance method
        if (error.message && error.message.startsWith('Cannot cancel')) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid appointment ID format',
            });
        }

        console.error('Error cancelling appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while cancelling appointment',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Update appointment status (Completed / No-Show)
// @route   PATCH /api/appointments/:id/status
// @access  Private (Staff / Admin)
// ──────────────────────────────────────────────
const updateStatus = async (req, res) => {
    try {
        const { status } = req.body;

        const allowedStatuses = ['Completed', 'No-Show'];
        if (!status || !allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${allowedStatuses.join(', ')}`,
            });
        }

        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found',
            });
        }

        // ── Step 5: Status Transition Guard ──
        // Only a Pending appointment can be moved to Completed or No-Show.
        if (appointment.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot update an appointment with status "${appointment.status}". Only Pending appointments can be marked as ${status}.`,
            });
        }

        // Use the appropriate instance method
        if (status === 'Completed') {
            await appointment.markCompleted();
        } else {
            await appointment.markNoShow();
        }

        res.status(200).json({
            success: true,
            message: `Appointment marked as ${status}`,
            data: appointment,
        });
    } catch (error) {
        // Catch the "cannot complete/no-show" errors thrown by instance methods
        if (error.message && (
            error.message.startsWith('Cannot complete') ||
            error.message.startsWith('Cannot mark as No-Show')
        )) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid appointment ID format',
            });
        }

        console.error('Error updating appointment status:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating appointment status',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get all appointments (with optional filters)
// @route   GET /api/appointments
// @access  Private (Admin)
// ──────────────────────────────────────────────
const getAllAppointments = async (req, res) => {
    try {
        const { status, clinicId, userId } = req.query;

        // ── Build dynamic filter object ──
        const filter = {};
        if (status)   filter.status   = status;
        if (clinicId) filter.clinicId = clinicId;
        if (userId)   filter.userId   = userId;

        const appointments = await Appointment
            .find(filter)
            .populate('clinicId',    'date startTime endTime vaccineType hospital')
            .populate('userId',      'name email phone')
            .populate('dependentId', 'name relationship dateOfBirth')
            .sort({ bookedAt: -1 });

        res.status(200).json({
            success: true,
            count: appointments.length,
            data: appointments,
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format in query parameters',
            });
        }

        console.error('Error fetching all appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching appointments',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Update an appointment (status only)
// @route   PUT /api/appointments/:id
// @access  Private (Admin / HospitalStaff)
// ──────────────────────────────────────────────
const updateAppointment = async (req, res) => {
    try {
        const { status } = req.body;

        // ── Input Validation ──
        const ALLOWED_STATUSES = ['Pending', 'Completed', 'Cancelled', 'No-Show'];
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'No update fields provided. Provide a status value.',
            });
        }
        if (!ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(', ')}`,
            });
        }

        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found',
            });
        }

        // ── Step 2: Restore seat count if cancelling a Pending appointment ──
        if (status === 'Cancelled' && appointment.status === 'Pending') {
            const clinic = await Clinic.findById(appointment.clinicId);
            if (clinic && clinic.bookedCount > 0) {
                clinic.bookedCount -= 1;
                await clinic.save();
            }
        }

        appointment.status = status;
        await appointment.save();

        const updatedAppointment = await Appointment.findById(req.params.id)
            .populate('clinicId', 'date startTime endTime vaccineType hospital')
            .populate('userId', 'name email phone')
            .populate('dependentId', 'name relationship dateOfBirth');

        res.status(200).json({
            success: true,
            message: 'Appointment updated successfully',
            data: updatedAppointment,
        });
    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: messages,
            });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid appointment ID format',
            });
        }

        console.error('Error updating appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating appointment',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Delete an appointment
// @route   DELETE /api/appointments/:id
// @access  Private (Admin)
// ──────────────────────────────────────────────
const deleteAppointment = async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found',
            });
        }

        // ── Restore seat count if the appointment was still Pending ──
        if (appointment.status === 'Pending') {
            const clinic = await Clinic.findById(appointment.clinicId);
            if (clinic && clinic.bookedCount > 0) {
                clinic.bookedCount -= 1;
                await clinic.save();
            }
        }

        await appointment.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Appointment deleted successfully',
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid appointment ID format',
            });
        }

        console.error('Error deleting appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting appointment',
            error: error.message,
        });
    }
};

export {
    bookAppointment,
    getMyAppointments,
    getAppointmentById,
    getClinicQueue,
    cancelAppointment,
    updateStatus,
    getAllAppointments,
    updateAppointment,
    deleteAppointment,
};
