import Record from '../models/Record.js';
import User from '../models/User.js';
import SideEffect from '../models/SideEffect.js';
import Hospital from '../models/Hospital.js';
import Vaccine from '../models/Vaccine.js';
import mongoose from 'mongoose';

// @desc    Create a new vaccination record (Mark as Vaccinated)
// @route   POST /api/records
// @access  Private (Hospital Staff Only)
const createRecord = async (req, res) => {
  const { patientId, vaccineId, batchId, hospitalId, dependentName } = req.body;

  try {
    // 1. Check if the patient exists
    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    // 2. Create the vaccination record
    // Sanitize dependentName: treat empty, whitespace-only, or the Swagger
    // placeholder literal "string" as null (meaning "Self / no dependent").
    const sanitizedDependent = (() => {
      if (!dependentName) return null;
      const trimmed = String(dependentName).trim();
      if (!trimmed || trimmed.toLowerCase() === 'string') return null;
      return trimmed;
    })();

    const record = await Record.create({
      patientId,
      dependentName: sanitizedDependent, // null means "for the patient themselves"
      vaccineId,     // Links to Minidu's Vaccine
      batchId,       // Links to Minidu's Batch
      hospitalId,    // Links to Nethmi's Hospital
      administeredBy: req.user._id // The staff member logged in right now
    });

    if (record) {
      res.status(201).json({
        success: true,
        message: 'Vaccination record created successfully',
        data: record,
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid record data',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error while creating record',
      error: error.message,
    });
  }
};

// @desc    Get logged-in user's vaccination history
// @route   GET /api/records/my
// @access  Private
const getMyRecords = async (req, res) => {
  try {
    // Find records where the patientId matches the logged-in user
    const records = await Record.find({ patientId: req.user._id })
      .populate('vaccineId', 'name manufacturer dosesRequired daysBetweenDoses')
      .populate('hospitalId', 'name city district')
      .populate('administeredBy', 'name')
      .sort({ dateAdministered: -1 });

    res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error while fetching records',
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Get full vaccination history for Self AND Dependents
// @route   GET /api/records/history
// @access  Private (Patient)
// ──────────────────────────────────────────────
const getHistory = async (req, res) => {
  try {
    // All records where patientId = logged-in user (covers self + dependents)
    // If dependentName is null → it's for the user themselves
    // If dependentName is set → it's for one of their dependents
    const records = await Record.find({ patientId: req.user._id })
      .populate('hospitalId', 'name city district')
      .populate('administeredBy', 'name')
      .sort({ dateAdministered: -1 });

    // Group records: separate self vs each dependent
    const selfRecords = records.filter((r) => !r.dependentName);
    const dependentRecords = records.filter((r) => r.dependentName);

    // Group dependent records by name
    const dependentMap = {};
    dependentRecords.forEach((r) => {
      if (!dependentMap[r.dependentName]) {
        dependentMap[r.dependentName] = [];
      }
      dependentMap[r.dependentName].push(r);
    });

    // Build grouped dependents array
    const dependents = Object.entries(dependentMap).map(([name, recs]) => ({
      dependentName: name,
      records: recs,
    }));

    res.status(200).json({
      success: true,
      data: {
        self: {
          name: req.user.name,
          count: selfRecords.length,
          records: selfRecords,
        },
        dependents,
        totalRecords: records.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error while fetching vaccination history',
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Get upcoming/due vaccinations for Self AND Dependents
// @route   GET /api/records/due
// @access  Private (Patient)
// ──────────────────────────────────────────────
const getDueRecords = async (req, res) => {
  try {
    const now = new Date();

    // Find records that have a nextDoseDate set and it's in the future (or today)
    const dueRecords = await Record.find({
      patientId: req.user._id,
      nextDoseDate: { $ne: null, $gte: now },
    })
      .populate('hospitalId', 'name city district')
      .sort({ nextDoseDate: 1 }); // Soonest first

    // Also find overdue records (nextDoseDate is in the past)
    const overdueRecords = await Record.find({
      patientId: req.user._id,
      nextDoseDate: { $ne: null, $lt: now },
    })
      .populate('hospitalId', 'name city district')
      .sort({ nextDoseDate: 1 });

    res.status(200).json({
      success: true,
      data: {
        upcoming: {
          count: dueRecords.length,
          records: dueRecords,
        },
        overdue: {
          count: overdueRecords.length,
          records: overdueRecords,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error while fetching due vaccinations',
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Get a single vaccination record by ID
// @route   GET /api/records/:id
// @access  Private (Patient who owns it OR Staff/Admin)
// ──────────────────────────────────────────────
const getRecordById = async (req, res) => {
  try {
    const record = await Record.findById(req.params.id)
      .populate('hospitalId', 'name city district')
      .populate('administeredBy', 'name');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Vaccination record not found',
      });
    }

    // Allow access if user is the patient OR if user is Staff/Admin
    const isOwner = record.patientId.toString() === req.user._id.toString();
    const isStaff = req.user.role === 'HospitalStaff' || req.user.role === 'Admin';

    if (!isOwner && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this record',
      });
    }

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid record ID format',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching record',
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Update a vaccination record
// @route   PUT /api/records/:id
// @access  Private (Staff/Admin only)
// ──────────────────────────────────────────────
const updateRecord = async (req, res) => {
  const { dateAdministered, nextDoseDate, dependentName, batchId, hospitalId } = req.body;

  try {
    const record = await Record.findById(req.params.id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Vaccination record not found',
      });
    }

    // Build update object (only allow safe fields)
    // patientId, vaccineId, administeredBy are immutable
    const updateFields = {};
    if (dateAdministered !== undefined) updateFields.dateAdministered = dateAdministered;
    if (nextDoseDate !== undefined) updateFields.nextDoseDate = nextDoseDate;
    if (dependentName !== undefined) updateFields.dependentName = dependentName;
    if (batchId !== undefined) updateFields.batchId = batchId;
    if (hospitalId !== undefined) updateFields.hospitalId = hospitalId;

    const updatedRecord = await Record.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    )
      .populate('hospitalId', 'name city district')
      .populate('administeredBy', 'name');

    res.status(200).json({
      success: true,
      message: 'Vaccination record updated successfully',
      data: updatedRecord,
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
      message: 'Server error while updating record',
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Delete a vaccination record (cascades to SideEffects)
// @route   DELETE /api/records/:id
// @access  Private (Staff/Admin only)
// ──────────────────────────────────────────────
const deleteRecord = async (req, res) => {
  try {
    const record = await Record.findById(req.params.id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Vaccination record not found',
      });
    }

    // Cascade: delete all side effects linked to this record
    await SideEffect.deleteMany({ recordId: req.params.id });

    // Delete the record itself
    await Record.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Vaccination record and associated side effects deleted successfully',
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid record ID format',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting record',
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Get all vaccination records (Admin/Staff monitoring)
// @route   GET /api/records
// @access  Private (Staff/Admin only)
// ──────────────────────────────────────────────
const getAllRecords = async (req, res) => {
  try {
    // Build optional filter from query params
    const filter = {};

    if (req.query.patientId) {
      if (mongoose.isValidObjectId(req.query.patientId)) {
        filter.patientId = req.query.patientId;
      } else {
        const users = await User.find({
          $or: [
            { nic: { $regex: req.query.patientId, $options: 'i' } },
            { name: { $regex: req.query.patientId, $options: 'i' } }
          ]
        });
        filter.patientId = { $in: users.map(u => u._id) };
      }
    }

    if (req.query.hospitalId) {
      if (mongoose.isValidObjectId(req.query.hospitalId)) {
        filter.hospitalId = req.query.hospitalId;
      } else {
        const hospitals = await Hospital.find({ name: { $regex: req.query.hospitalId, $options: 'i' } });
        filter.hospitalId = { $in: hospitals.map(h => h._id) };
      }
    }

    if (req.query.vaccineId) {
      if (mongoose.isValidObjectId(req.query.vaccineId)) {
        filter.vaccineId = req.query.vaccineId;
      } else {
        const vaccines = await Vaccine.find({ name: { $regex: req.query.vaccineId, $options: 'i' } });
        filter.vaccineId = { $in: vaccines.map(v => v._id) };
      }
    }

    const records = await Record.find(filter)
      .populate('patientId', 'name email nic')
      .populate('vaccineId', 'name manufacturer dosesRequired daysBetweenDoses')
      .populate('hospitalId', 'name city district')
      .populate('administeredBy', 'name')
      .sort({ dateAdministered: -1 });

    res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error while fetching all records',
      error: error.message,
    });
  }
};

export {
  createRecord,
  getMyRecords,
  getHistory,
  getDueRecords,
  getRecordById,
  updateRecord,
  deleteRecord,
  getAllRecords,
};
