import express from "express";
import {
    createVaccine,
    deleteVaccine,
    getAllVaccines,
    getVaccineById,
    updateVaccine,
} from "../controllers/vaccineController.js";
import { adminOnly, protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";

const router = express.Router();

// GET /api/vaccines -> Get all vaccines (Public)
router.get("/", getAllVaccines);

// GET /api/vaccines/:id -> Get a single vaccine (Public)
router.get("/:id", getVaccineById);

// POST /api/vaccines -> Create a new vaccine (with optional image upload)
// Access: Admin only
router.post("/", protect, adminOnly, upload.single("image"), createVaccine);

// PATCH /api/vaccines/:id -> Update a vaccine (with optional image upload)
// Access: Admin only
router.patch("/:id", protect, adminOnly, upload.single("image"), updateVaccine);

// DELETE /api/vaccines/:id -> Delete a vaccine
// Access: Admin only
router.delete("/:id", protect, adminOnly, deleteVaccine);

export default router;
