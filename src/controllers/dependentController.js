import mongoose from 'mongoose';
import Dependent from '../models/Dependent.js';

const canAccessDependent = (userId, dependent) => {
  const ownerMatch = dependent.userId?.toString() === userId.toString();
  const sharedMatch = (dependent.sharedWithUserIds || []).some(
    (sharedUserId) => sharedUserId.toString() === userId.toString()
  );
  return ownerMatch || sharedMatch;
};

const addDependent = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, dateOfBirth, relationship, gender } = req.body;

    if (!name || !dateOfBirth || !relationship || !gender) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, dateOfBirth, relationship, gender',
      });
    }

    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob >= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'dateOfBirth must be a valid date in the past',
      });
    }

    if (
      req.body.sharedWithUserIds !== undefined &&
      !Array.isArray(req.body.sharedWithUserIds)
    ) {
      return res.status(400).json({
        success: false,
        message: 'sharedWithUserIds must be an array',
      });
    }

    const sharedWithUserIds = Array.isArray(req.body.sharedWithUserIds)
      ? [...new Set(req.body.sharedWithUserIds)]
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .filter((id) => id.toString() !== userId.toString())
      : [];

    const dependent = await Dependent.create({
      ...req.body,
      userId,
      sharedWithUserIds,
    });

    return res.status(201).json({
      success: true,
      data: dependent,
    });
  } catch (error) {
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
        message: 'Invalid ID format',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error while creating dependent',
      error: error.message,
    });
  }
};

const getDependentsByParent = async (req, res) => {
  try {
    const userId = req.user._id;

    const dependents = await Dependent.findByUser(userId);

    return res.status(200).json({
      success: true,
      count: dependents.length,
      data: dependents,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching dependents',
      error: error.message,
    });
  }
};

const getDependentById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dependent id',
      });
    }

    const dependent = await Dependent.findById(req.params.id);

    if (!dependent) {
      return res.status(404).json({
        success: false,
        message: 'Dependent not found',
      });
    }

    if (!canAccessDependent(req.user._id, dependent)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this dependent',
      });
    }

    return res.status(200).json({
      success: true,
      data: dependent,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching dependent',
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Update a dependent's details
// @route   PUT /api/users/dependents/:id
// @access  Authenticated
// ──────────────────────────────────────────────
const updateDependent = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dependent id',
      });
    }

    let dependent = await Dependent.findById(req.params.id);

    if (!dependent) {
      return res.status(404).json({
        success: false,
        message: 'Dependent not found',
      });
    }

    if (!canAccessDependent(req.user._id, dependent)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this dependent',
      });
    }

    const { name, dateOfBirth, relationship, gender, medicalNotes, nic } = req.body;
    let updateData = { name, dateOfBirth, relationship, gender, medicalNotes, nic };

    // Remove undefined fields so we don't overwrite with null
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No update fields provided',
      });
    }

    if (dateOfBirth !== undefined) {
      const dob = new Date(dateOfBirth);
      if (Number.isNaN(dob.getTime()) || dob >= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'dateOfBirth must be a valid date in the past',
        });
      }
    }

    dependent = await Dependent.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      success: true,
      message: 'Dependent updated successfully',
      data: dependent,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error while updating dependent',
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Delete a dependent
// @route   DELETE /api/users/dependents/:id
// @access  Authenticated (Parent only)
// ──────────────────────────────────────────────
const deleteDependent = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dependent id',
      });
    }

    const dependent = await Dependent.findById(req.params.id);

    if (!dependent) {
      return res.status(404).json({
        success: false,
        message: 'Dependent not found',
      });
    }

    if (dependent.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this dependent. Only the parent can delete.',
      });
    }

    await dependent.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Dependent deleted successfully',
      data: {}, // Some standard patterns might add an empty data object
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting dependent',
      error: error.message,
    });
  }
};

export { addDependent, deleteDependent, getDependentById, getDependentsByParent, updateDependent };
