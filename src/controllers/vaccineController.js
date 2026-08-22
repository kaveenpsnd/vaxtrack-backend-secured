import Vaccine from "../models/Vaccine.js";
import { deleteImage, uploadImage } from "../services/cloudinaryService.js";

// ──────────────────────────────────────────────
// @desc    Create a new vaccine
// @route   POST /api/vaccines
// @access  Admin
// ──────────────────────────────────────────────
const createVaccine = async (req, res) => {
  try {
    const { name, manufacturer, description, dosesRequired, daysBetweenDoses } =
      req.body;

    if (
      !name ||
      !manufacturer ||
      !description ||
      dosesRequired === undefined ||
      daysBetweenDoses === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: name, manufacturer, description, dosesRequired, daysBetweenDoses",
      });
    }

    const parsedDoses = Number(dosesRequired);
    const parsedDays = Number(daysBetweenDoses);

    if (!Number.isInteger(parsedDoses) || parsedDoses < 1) {
      return res.status(400).json({
        success: false,
        message: "dosesRequired must be an integer greater than or equal to 1",
      });
    }

    if (!Number.isInteger(parsedDays) || parsedDays < 0) {
      return res.status(400).json({
        success: false,
        message:
          "daysBetweenDoses must be a non-negative integer",
      });
    }

    if (req.file && !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "Invalid image upload payload",
      });
    }

    // Upload image to Cloudinary if a file was provided
    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadImage(req.file.buffer);
    }

    const vaccine = await Vaccine.create({
      name,
      manufacturer,
      description,
      dosesRequired: parsedDoses,
      daysBetweenDoses: parsedDays,
      imageUrl,
    });

    res.status(201).json({
      success: true,
      message: "Vaccine created successfully",
      data: vaccine,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A vaccine with this name already exists",
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

    res.status(500).json({
      success: false,
      message: "Server error while creating vaccine",
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Get all vaccines (with optional filters)
// @route   GET /api/vaccines
// @access  Public
// ──────────────────────────────────────────────
const getAllVaccines = async (req, res) => {
  try {
    const { manufacturer } = req.query;

    const filter = {};
    if (manufacturer) filter.manufacturer = { $regex: manufacturer, $options: "i" };

    const vaccines = await Vaccine.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: vaccines.length,
      data: vaccines,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error while fetching vaccines",
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Get a single vaccine by ID
// @route   GET /api/vaccines/:id
// @access  Public
// ──────────────────────────────────────────────
const getVaccineById = async (req, res) => {
  try {
    const vaccine = await Vaccine.findById(req.params.id);

    if (!vaccine) {
      return res.status(404).json({
        success: false,
        message: "Vaccine not found",
      });
    }

    res.status(200).json({
      success: true,
      data: vaccine,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid vaccine ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while fetching vaccine",
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Update a vaccine
// @route   PATCH /api/vaccines/:id
// @access  Admin
// ──────────────────────────────────────────────
const updateVaccine = async (req, res) => {
  try {
    let vaccine = await Vaccine.findById(req.params.id);

    if (!vaccine) {
      return res.status(404).json({
        success: false,
        message: "Vaccine not found",
      });
    }

    const { name, manufacturer, description, dosesRequired, daysBetweenDoses, removeImage } = req.body;

    let updateData = { name, manufacturer, description, dosesRequired, daysBetweenDoses };

    // Remove undefined and empty string fields (empty strings are sent by Swagger UI for untouched fields)
    Object.keys(updateData).forEach(
      (key) => (updateData[key] === undefined || updateData[key] === "") && delete updateData[key]
    );

    const wantsRemoveImage = removeImage === true || removeImage === "true";

    if (Object.keys(updateData).length === 0 && !req.file && !wantsRemoveImage) {
      return res.status(400).json({
        success: false,
        message: "No update fields provided",
      });
    }

    if (updateData.dosesRequired !== undefined && (!Number.isInteger(Number(updateData.dosesRequired)) || Number(updateData.dosesRequired) < 1)) {
      return res.status(400).json({
        success: false,
        message: "dosesRequired must be an integer greater than or equal to 1",
      });
    }

    if (updateData.daysBetweenDoses !== undefined && (!Number.isInteger(Number(updateData.daysBetweenDoses)) || Number(updateData.daysBetweenDoses) < 0)) {
      return res.status(400).json({
        success: false,
        message: "daysBetweenDoses must be a non-negative integer",
      });
    }

    if (updateData.name !== undefined && !updateData.name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vaccine name cannot be empty",
      });
    }

    if (req.file) {
      // New image upload — replaces any existing image
      if (vaccine.imageUrl) {
        await deleteImage(vaccine.imageUrl);
      }
      updateData.imageUrl = await uploadImage(req.file.buffer);
    } else if (wantsRemoveImage) {
      // Explicitly clear the image without uploading a new one
      if (vaccine.imageUrl) {
        await deleteImage(vaccine.imageUrl);
      }
      updateData.imageUrl = null;
    }

    vaccine = await Vaccine.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Vaccine updated successfully",
      data: vaccine,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A vaccine with this name already exists",
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
        message: "Invalid vaccine ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while updating vaccine",
      error: error.message,
    });
  }
};

// ──────────────────────────────────────────────
// @desc    Delete a vaccine
// @route   DELETE /api/vaccines/:id
// @access  Admin
// ──────────────────────────────────────────────
const deleteVaccine = async (req, res) => {
  try {
    const vaccine = await Vaccine.findById(req.params.id);

    if (!vaccine) {
      return res.status(404).json({
        success: false,
        message: "Vaccine not found",
      });
    }

    if (vaccine.imageUrl) {
      await deleteImage(vaccine.imageUrl);
    }

    await vaccine.deleteOne();

    res.status(200).json({
      success: true,
      message: "Vaccine deleted successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid vaccine ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while deleting vaccine",
      error: error.message,
    });
  }
};

export {
  createVaccine, deleteVaccine, getAllVaccines,
  getVaccineById,
  updateVaccine
};
