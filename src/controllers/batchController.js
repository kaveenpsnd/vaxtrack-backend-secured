import mongoose from "mongoose";
import Batch from "../models/Batch.js";
import Hospital from "../models/Hospital.js";
import Vaccine from "../models/Vaccine.js";

// @desc    Create a new batch (stock)
// @route   POST /api/batches
// @access  Admin
const createBatch = async (req, res) => {
  try {
    const {
      vaccineId,
      hospitalId,
      batchNumber,
      quantity,
      expiryDate,
      arrivalDate,
      status,
    } = req.body;

    if (
      !vaccineId ||
      !hospitalId ||
      !batchNumber ||
      quantity === undefined ||
      !expiryDate
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: vaccineId, hospitalId, batchNumber, quantity, expiryDate",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(vaccineId) ||
      !mongoose.Types.ObjectId.isValid(hospitalId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a non-negative integer",
      });
    }

    // Validate that the vaccine exists
    const vaccine = await Vaccine.findById(vaccineId);
    if (!vaccine) {
      return res.status(404).json({
        success: false,
        message: "Vaccine not found",
      });
    }

    // Validate that the hospital exists
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    // Validate expiry date is in the future
    const expiryDateObj = new Date(expiryDate);
    if (isNaN(expiryDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Expiry date must be a valid date",
      });
    }

    if (expiryDateObj <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Expiry date must be in the future",
      });
    }

    // Create batch data object
    const batchData = {
      vaccineId,
      hospitalId,
      batchNumber,
      quantity,
      expiryDate: expiryDateObj,
    };

    // Add optional fields if provided
    if (arrivalDate) {
      const arrivalDateObj = new Date(arrivalDate);
      if (isNaN(arrivalDateObj.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Arrival date must be a valid date",
        });
      }
      batchData.arrivalDate = arrivalDateObj;
    }
    if (status) {
      batchData.status = status;
    }

    const batch = await Batch.create(batchData);

    // Populate vaccine and hospital details for response
    await batch.populate("vaccineId", "name manufacturer");
    await batch.populate("hospitalId", "name city district");

    res.status(201).json({
      success: true,
      message: "Batch created successfully",
      data: batch,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A batch with this batch number already exists",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: messages,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while creating batch",
      error: error.message,
    });
  }
};

// @desc    Update a batch
// @route   PUT /api/batches/:id
// @access  Admin
const updateBatch = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batch ID format",
      });
    }

    const batch = await Batch.findById(req.params.id);

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    const { quantity, expiryDate, arrivalDate, status } = req.body;

    // Build update object with only provided fields
    const updateData = {};
    if (quantity !== undefined) updateData.quantity = quantity;
    if (expiryDate !== undefined) updateData.expiryDate = expiryDate;
    if (arrivalDate !== undefined) updateData.arrivalDate = arrivalDate;
    if (status !== undefined) updateData.status = status;

    // Require at least one field to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No update fields provided",
      });
    }

    // Validate quantity if provided
    if (quantity !== undefined) {
      if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be a non-negative integer",
        });
      }
    }

    // Validate expiryDate if provided
    if (expiryDate !== undefined) {
      const expiryDateObj = new Date(expiryDate);
      if (isNaN(expiryDateObj.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Expiry date must be a valid date",
        });
      }
      updateData.expiryDate = expiryDateObj;
    }

    // Validate arrivalDate if provided
    if (arrivalDate !== undefined) {
      const arrivalDateObj = new Date(arrivalDate);
      if (isNaN(arrivalDateObj.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Arrival date must be a valid date",
        });
      }
      updateData.arrivalDate = arrivalDateObj;
    }

    // Validate status if provided
    const allowedStatuses = ["Available", "Expired", "Depleted"];
    if (status !== undefined && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowedStatuses.join(", ")}`,
      });
    }

    const updatedBatch = await Batch.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    await updatedBatch.populate("vaccineId", "name manufacturer");
    await updatedBatch.populate("hospitalId", "name location");

    res.status(200).json({
      success: true,
      message: "Batch updated successfully",
      data: updatedBatch,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: messages,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid batch ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while updating batch",
      error: error.message,
    });
  }
};

// @desc    Get all batches (with optional filters)
// @route   GET /api/batches
// @access  Admin/Staff
const getAllBatches = async (req, res) => {
  try {
    const { hospitalId, vaccineId, status } = req.query;

    const filter = {};
    if (hospitalId) filter.hospitalId = hospitalId;
    if (vaccineId) filter.vaccineId = vaccineId;
    if (status) filter.status = status;

    const batches = await Batch.find(filter)
      .populate("vaccineId", "name manufacturer")
      .populate("hospitalId", "name location")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: batches.length,
      data: batches,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error while fetching batches",
      error: error.message,
    });
  }
};

// @desc    Get a single batch by ID
// @route   GET /api/batches/:id
// @access  Admin/Staff
const getBatchById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batch ID format",
      });
    }

    const batch = await Batch.findById(req.params.id);

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    await batch.populate("vaccineId", "name manufacturer");
    await batch.populate("hospitalId", "name location");

    res.status(200).json({
      success: true,
      data: batch,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid batch ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while fetching batch",
      error: error.message,
    });
  }
};

// @desc    Delete a batch
// @route   DELETE /api/batches/:id
// @access  Admin
const deleteBatch = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batch ID format",
      });
    }

    const batch = await Batch.findById(req.params.id);

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    await batch.deleteOne();

    res.status(200).json({
      success: true,
      message: "Batch deleted successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid batch ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while deleting batch",
      error: error.message,
    });
  }
};

export { createBatch, deleteBatch, getAllBatches, getBatchById, updateBatch };
