import SideEffect from '../models/SideEffect.js';
import Record from '../models/Record.js';

// ──────────────────────────────────────────────
// @desc    Report a side effect for a vaccination
// @route   POST /api/side-effects
// @access  Private (Patient)
// ──────────────────────────────────────────────
const reportSideEffect = async (req, res) => {
    const { recordId, symptoms, severity } = req.body;

    try {
        // 1. Validate required fields
        if (!recordId || !symptoms || symptoms.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'recordId and at least one symptom are required',
            });
        }

        // 2. Verify the vaccination record exists
        const record = await Record.findById(recordId);
        if (!record) {
            return res.status(404).json({
                success: false,
                message: 'Vaccination record not found',
            });
        }

        // 3. Verify the logged-in user owns this record
        //    (they must be the patient or the parent of the dependent)
        if (record.patientId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only report side effects for your own vaccinations',
            });
        }

        // 4. Create the side effect report
        const sideEffect = await SideEffect.create({
            recordId,
            userId: req.user._id,
            symptoms,
            severity: severity || 'Mild',
        });

        // 5. Populate the record reference for a richer response
        await sideEffect.populate('recordId', 'vaccineId dateAdministered dependentName');

        res.status(201).json({
            success: true,
            message: 'Side effect reported successfully',
            data: sideEffect,
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid record ID format',
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
            message: 'Server error while reporting side effect',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get side effects reported by the logged-in user
// @route   GET /api/side-effects/my
// @access  Private (Patient)
// ──────────────────────────────────────────────
const getMySideEffects = async (req, res) => {
    try {
        const sideEffects = await SideEffect.find({ userId: req.user._id })
            .populate({
                path: 'recordId',
                select: 'vaccineId hospitalId dateAdministered dependentName',
                populate: [
                    { path: 'hospitalId', select: 'name city' },
                ],
            })
            .sort({ dateReported: -1 });

        res.status(200).json({
            success: true,
            count: sideEffects.length,
            data: sideEffects,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error while fetching side effects',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get a single side effect by ID
// @route   GET /api/side-effects/:id
// @access  Private (Owner only)
// ──────────────────────────────────────────────
const getSideEffectById = async (req, res) => {
    try {
        const sideEffect = await SideEffect.findById(req.params.id)
            .populate({
                path: 'recordId',
                select: 'vaccineId hospitalId dateAdministered dependentName',
                populate: [
                    { path: 'hospitalId', select: 'name city' },
                ],
            });

        if (!sideEffect) {
            return res.status(404).json({
                success: false,
                message: 'Side effect report not found',
            });
        }

        // Verify ownership (Staff/Admin may view any report)
        const isOwner = sideEffect.userId.toString() === req.user._id.toString();
        const isStaffOrAdmin = ['Admin', 'HospitalStaff'].includes(req.user.role);
        if (!isOwner && !isStaffOrAdmin) {
            return res.status(403).json({
                success: false,
                message: 'You can only view your own side effect reports',
            });
        }

        res.status(200).json({
            success: true,
            data: sideEffect,
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid side effect ID format',
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while fetching side effect',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Update a side effect report (symptoms/severity only)
// @route   PUT /api/side-effects/:id
// @access  Private (Owner only)
// ──────────────────────────────────────────────
const updateSideEffect = async (req, res) => {
    const { symptoms, severity } = req.body;

    try {
        const sideEffect = await SideEffect.findById(req.params.id);

        if (!sideEffect) {
            return res.status(404).json({
                success: false,
                message: 'Side effect report not found',
            });
        }

        // Verify ownership (Staff/Admin may update any report)
        const isOwner = sideEffect.userId.toString() === req.user._id.toString();
        const isStaffOrAdmin = ['Admin', 'HospitalStaff'].includes(req.user.role);
        if (!isOwner && !isStaffOrAdmin) {
            return res.status(403).json({
                success: false,
                message: 'You can only update your own side effect reports',
            });
        }

        // Validate symptoms if provided
        if (symptoms !== undefined && (!Array.isArray(symptoms) || symptoms.length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'Symptoms must be a non-empty array',
            });
        }

        // Build update object (only allow symptoms and severity)
        const updateFields = {};
        if (symptoms !== undefined) updateFields.symptoms = symptoms;
        if (severity !== undefined) updateFields.severity = severity;

        const updatedSideEffect = await SideEffect.findByIdAndUpdate(
            req.params.id,
            updateFields,
            { new: true, runValidators: true }
        ).populate({
            path: 'recordId',
            select: 'vaccineId hospitalId dateAdministered dependentName',
            populate: [
                { path: 'hospitalId', select: 'name city' },
            ],
        });

        res.status(200).json({
            success: true,
            message: 'Side effect report updated successfully',
            data: updatedSideEffect,
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid side effect ID format',
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
            message: 'Server error while updating side effect',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Delete a side effect report
// @route   DELETE /api/side-effects/:id
// @access  Private (Owner only)
// ──────────────────────────────────────────────
const deleteSideEffect = async (req, res) => {
    try {
        const sideEffect = await SideEffect.findById(req.params.id);

        if (!sideEffect) {
            return res.status(404).json({
                success: false,
                message: 'Side effect report not found',
            });
        }

        // Verify ownership (Admin may delete any report)
        const isOwner = sideEffect.userId.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'Admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own side effect reports',
            });
        }

        await SideEffect.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: 'Side effect report deleted successfully',
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid side effect ID format',
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while deleting side effect',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get all side effects (Admin/Staff monitoring)
// @route   GET /api/side-effects
// @access  Private (Admin/HospitalStaff only)
// ──────────────────────────────────────────────
const getAllSideEffects = async (req, res) => {
    try {
        // Build base filter
        const filter = {};
        if (req.query.severity) filter.severity = req.query.severity;

        // Filter by userId directly (legacy support)
        if (req.query.userId) filter.userId = req.query.userId;

        // Filter by NIC — resolve user ID first
        if (req.query.nic) {
            const User = (await import('../models/User.js')).default;
            const matchedUser = await User.findOne({
                nic: { $regex: `^${req.query.nic.trim()}`, $options: 'i' },
            }).select('_id');
            if (matchedUser) {
                filter.userId = matchedUser._id;
            } else {
                // NIC provided but no user found → return empty
                return res.status(200).json({ success: true, count: 0, data: [] });
            }
        }

        // Filter by vaccineId — must match via the linked record
        if (req.query.vaccineId) {
            const Record = (await import('../models/Record.js')).default;
            const matchingRecords = await Record.find({ vaccineId: req.query.vaccineId }).select('_id');
            const recordIds = matchingRecords.map((r) => r._id);
            filter.recordId = { $in: recordIds };
        }

        const sideEffects = await SideEffect.find(filter)
            .populate('userId', 'name email nic')
            .populate({
                path: 'recordId',
                select: 'vaccineId hospitalId dateAdministered dependentName',
                populate: [
                    { path: 'vaccineId', select: 'name manufacturer' },
                    { path: 'hospitalId', select: 'name city' },
                ],
            })
            .sort({ dateReported: -1 });

        res.status(200).json({
            success: true,
            count: sideEffects.length,
            data: sideEffects,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error while fetching all side effects',
            error: error.message,
        });
    }
};


export {
    reportSideEffect,
    getMySideEffects,
    getSideEffectById,
    updateSideEffect,
    deleteSideEffect,
    getAllSideEffects,
};
