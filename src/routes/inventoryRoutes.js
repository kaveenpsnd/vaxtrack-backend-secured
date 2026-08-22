import express from "express";
import { getLowStockInventory } from "../controllers/inventoryController.js";

const router = express.Router();

// GET /api/inventory/low-stock -> Fetch low stock batches
router.get("/low-stock", getLowStockInventory);

export default router;
