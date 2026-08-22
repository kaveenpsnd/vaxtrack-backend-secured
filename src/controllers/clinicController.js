import Clinic from '../models/Clinic.js';
import Hospital from '../models/Hospital.js';

// ──────────────────────────────────────────────
// @desc    Create a new clinic session
// @route   POST /api/clinics
// @access  Staff / Admin
// ──────────────────────────────────────────────
const createClinic = async (req, res) => {
    try {
        const { hospital, date, startTime, endTime, capacity, vaccineType } =
            req.body;

        // ── Input Validation ──
        const missingFields = [];
        if (!hospital) missingFields.push('hospital');
        if (!date) missingFields.push('date');
        if (!startTime) missingFields.push('startTime');
        if (!endTime) missingFields.push('endTime');
        if (!vaccineType || !vaccineType.trim()) missingFields.push('vaccineType');
        if (capacity === undefined || capacity === null) missingFields.push('capacity');

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`,
            });
        }

        // Validate time format (HH:mm 24-hour)
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(startTime)) {
            return res.status(400).json({
                success: false,
                message: 'startTime must be in HH:mm 24-hour format (e.g., 09:00)',
            });
        }
        if (!timeRegex.test(endTime)) {
            return res.status(400).json({
                success: false,
                message: 'endTime must be in HH:mm 24-hour format (e.g., 17:00)',
            });
        }

        // Validate endTime is after startTime
        if (endTime <= startTime) {
            return res.status(400).json({
                success: false,
                message: 'End time must be after start time',
            });
        }

        // Validate date is not in the past
        const clinicDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (clinicDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Clinic date cannot be in the past',
            });
        }

        // Verify the referenced hospital exists
        const hospitalExists = await Hospital.findById(hospital);
        if (!hospitalExists) {
            return res.status(404).json({
                success: false,
                message: 'Hospital not found. Cannot create a clinic for a non-existent hospital.',
            });
        }

        // Controller-level capacity validation (schema also enforces min: 1)
        if (!Number.isInteger(capacity) || capacity < 1) {
            return res.status(400).json({
                success: false,
                message: 'Capacity must be a positive integer (>= 1)',
            });
        }

        // Check for overlapping clinic sessions at the same hospital on the same date
        const overlapping = await Clinic.checkOverlap(hospital, date, startTime, endTime);
        if (overlapping) {
            return res.status(409).json({
                success: false,
                message: `Schedule conflict: This clinic overlaps with an existing session (${overlapping.startTime} – ${overlapping.endTime}) at the same hospital on the same date.`,
                conflictWith: {
                    clinicId: overlapping._id,
                    startTime: overlapping.startTime,
                    endTime: overlapping.endTime,
                },
            });
        }

        const clinic = await Clinic.create({
            hospital,
            date,
            startTime,
            endTime,
            capacity,
            vaccineType: vaccineType || null,
        });

        // Populate hospital details before returning
        await clinic.populate('hospital', 'name city district');

        res.status(201).json({
            success: true,
            message: 'Clinic session created successfully',
            data: clinic,
        });
    } catch (error) {
        // Duplicate clinic session (same hospital + date + startTime)
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    'A clinic session already exists at this hospital for the given date and start time',
            });
        }

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err) => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: messages,
            });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format provided',
            });
        }

        console.error('Error creating clinic:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating clinic session',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get all clinic sessions (with optional filters)
// @route   GET /api/clinics
// @access  Public
// ──────────────────────────────────────────────
const getAllClinics = async (req, res) => {
    try {
        // Build optional filters from query params
        const filter = {};

        if (req.query.date) {
            // Match the exact calendar day
            const queryDate = new Date(req.query.date);
            filter.date = {
                $gte: new Date(queryDate.setHours(0, 0, 0, 0)),
                $lt: new Date(queryDate.setHours(23, 59, 59, 999)),
            };
        }

        if (req.query.vaccineType) {
            filter.vaccineType = { $regex: req.query.vaccineType, $options: 'i' };
        }

        const clinics = await Clinic.find(filter)
            .populate('hospital', 'name city district')
            .sort({ date: 1, startTime: 1 });

        res.status(200).json({
            success: true,
            count: clinics.length,
            data: clinics,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error while fetching clinic sessions',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get all clinic sessions for a hospital
// @route   GET /api/clinics/hospital/:hospitalId
// @access  Public
// ──────────────────────────────────────────────
const getClinicsByHospital = async (req, res) => {
    try {
        const { hospitalId } = req.params;

        // Verify the hospital exists
        const hospitalExists = await Hospital.findById(hospitalId);
        if (!hospitalExists) {
            return res.status(404).json({
                success: false,
                message: 'Hospital not found',
            });
        }

        // Build optional date filter from query params
        const filter = { hospital: hospitalId };

        if (req.query.date) {
            // Match the exact calendar day (start of day → end of day)
            const queryDate = new Date(req.query.date);
            filter.date = {
                $gte: new Date(queryDate.setHours(0, 0, 0, 0)),
                $lt: new Date(queryDate.setHours(23, 59, 59, 999)),
            };
        }

        if (req.query.vaccineType) {
            filter.vaccineType = { $regex: req.query.vaccineType, $options: 'i' };
        }

        const clinics = await Clinic.find(filter)
            .populate('hospital', 'name city district')
            .sort({ date: 1, startTime: 1 });

        res.status(200).json({
            success: true,
            count: clinics.length,
            data: clinics,
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid hospital ID format',
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while fetching clinic sessions',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get a single clinic session by ID
// @route   GET /api/clinics/:id
// @access  Public
// ──────────────────────────────────────────────
const getClinicById = async (req, res) => {
    try {
        const clinic = await Clinic.findById(req.params.id)
            .populate('hospital', 'name city district');

        if (!clinic) {
            return res.status(404).json({
                success: false,
                message: 'Clinic session not found',
            });
        }

        res.status(200).json({
            success: true,
            data: clinic,
        });
    } catch (error) {
        // Handle invalid ObjectId format
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid clinic ID format',
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while fetching clinic session',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Update clinic capacity
// @route   PATCH /api/clinics/:id/capacity
// @access  Staff / Admin
// ──────────────────────────────────────────────
const updateClinicCapacity = async (req, res) => {
    try {
        const { capacity } = req.body;

        // ── Validate capacity ──
        if (capacity === undefined || capacity === null) {
            return res.status(400).json({
                success: false,
                message: 'Capacity value is required',
            });
        }

        if (!Number.isInteger(capacity) || capacity < 1) {
            return res.status(400).json({
                success: false,
                message: 'Capacity must be a positive integer (>= 1)',
            });
        }

        const clinic = await Clinic.findById(req.params.id);

        if (!clinic) {
            return res.status(404).json({
                success: false,
                message: 'Clinic session not found',
            });
        }

        // Prevent reducing capacity below the number of existing bookings
        if (capacity < clinic.bookedCount) {
            return res.status(400).json({
                success: false,
                message: `Cannot reduce capacity below the current booked count (${clinic.bookedCount}). Cancel some appointments first.`,
            });
        }

        clinic.capacity = capacity;
        await clinic.save();

        // Re-populate for a clean response
        await clinic.populate('hospital', 'name city district');

        res.status(200).json({
            success: true,
            message: 'Clinic capacity updated successfully',
            data: clinic,
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid clinic ID format',
            });
        }

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err) => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: messages,
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while updating clinic capacity',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Update a clinic session (Full update)
// @route   PUT /api/clinics/:id
// @access  Staff / Admin
// ──────────────────────────────────────────────
const updateClinic = async (req, res) => {
    try {
        const { date, startTime, endTime, capacity, vaccineType, hospital } = req.body;

        const clinic = await Clinic.findById(req.params.id);

        if (!clinic) {
            return res.status(404).json({
                success: false,
                message: 'Clinic session not found',
            });
        }

        // --- VALIDATION AND UPDATES ---

        // 1. Prevent updates if bookings exist (optional rule, but safer)
        if (clinic.bookedCount > 0) {
            // Basic check: Don't allow changing date/time/hospital if people are booked
            if ((date && new Date(date).getTime() !== new Date(clinic.date).getTime()) ||
                (startTime && startTime !== clinic.startTime) ||
                (endTime && endTime !== clinic.endTime) ||
                (hospital && hospital !== clinic.hospital.toString())) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot reschedule a clinic that already has bookings. Please create a new session or contact support.',
                });
            }

            // Check capacity reduction
            if (capacity && capacity < clinic.bookedCount) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot reduce capacity below the current number of bookings',
                });
            }
        }

        // 2. If Schedule is changing, check for Overlaps (excluding self)
        if (date || startTime || endTime) {
            const newDate = date || clinic.date;
            const newStart = startTime || clinic.startTime;
            const newEnd = endTime || clinic.endTime;
            const targetHospital = hospital || clinic.hospital; // Use new or existing

            // Validate time format if provided
            const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
            if (startTime && !timeRegex.test(startTime)) {
                return res.status(400).json({
                    success: false,
                    message: 'startTime must be in HH:mm 24-hour format (e.g., 09:00)',
                });
            }
            if (endTime && !timeRegex.test(endTime)) {
                return res.status(400).json({
                    success: false,
                    message: 'endTime must be in HH:mm 24-hour format (e.g., 17:00)',
                });
            }

            // Check end > start
            if (newEnd <= newStart) {
                return res.status(400).json({
                    success: false,
                    message: 'End time must be after the start time',
                });
            }

            // Check overlap
            const overlapping = await Clinic.checkOverlap(targetHospital, newDate, newStart, newEnd, clinic._id);
            if (overlapping) {
                return res.status(409).json({
                    success: false,
                    message: `Schedule conflict: This clinic overlaps with an existing session (${overlapping.startTime} – ${overlapping.endTime}) at the same hospital.`,
                    conflictWith: overlapping._id
                });
            }
        }

        // 3. Apply Updates
        if (date) clinic.date = date;
        if (startTime) clinic.startTime = startTime;
        if (endTime) clinic.endTime = endTime;
        if (capacity) clinic.capacity = capacity;
        if (vaccineType) clinic.vaccineType = vaccineType;
        if (hospital) clinic.hospital = hospital;

        await clinic.save();

        // Populate for response
        await clinic.populate('hospital', 'name city district');

        res.status(200).json({
            success: true,
            message: 'Clinic session updated successfully',
            data: clinic,
        });

    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ success: false, message: 'Validation failed', errors: messages });
        }
        res.status(500).json({
            success: false,
            message: 'Server error while updating clinic',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Delete a clinic session
// @route   DELETE /api/clinics/:id
// @access  Admin
// ──────────────────────────────────────────────
const deleteClinic = async (req, res) => {
    try {
        const clinic = await Clinic.findById(req.params.id);

        if (!clinic) {
            return res.status(404).json({
                success: false,
                message: 'Clinic session not found',
            });
        }

        // Safety check: prevent deleting a clinic that has active bookings
        if (clinic.bookedCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete a clinic session with ${clinic.bookedCount} active booking(s). Cancel all appointments first.`,
            });
        }

        await clinic.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Clinic session deleted successfully',
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid clinic ID format',
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while deleting clinic session',
            error: error.message,
        });
    }
};

export {
    createClinic,
    getAllClinics,
    getClinicsByHospital,
    getClinicById,
    updateClinic,
    updateClinicCapacity,
    deleteClinic,
};
