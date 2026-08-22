import express from "express";
import { createBatch, deleteBatch, getAllBatches, getBatchById, updateBatch } from "../controllers/batchController.js";
import { adminOnly, protect, staffOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// All batch routes require authentication + Admin or HospitalStaff role
router.use(protect, staffOnly);

// GET    /api/batches       → Get all batches (Admin | HospitalStaff)
router.get("/", getAllBatches);

// GET    /api/batches/:id   → Get a single batch (Admin | HospitalStaff)
router.get("/:id", getBatchById);

// POST   /api/batches       → Create a new batch (Admin | HospitalStaff)
router.post("/", createBatch);

// PUT    /api/batches/:id   → Update a batch (Admin | HospitalStaff)
router.put("/:id", updateBatch);

// DELETE /api/batches/:id   → Delete a batch (Admin only)
router.delete("/:id", adminOnly, deleteBatch);

export default router;
