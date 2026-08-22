import Batch from "../models/Batch.js";

// @desc    Get low stock inventory batches
// @route   GET /api/inventory/low-stock
// @access  Admin
const getLowStockInventory = async (req, res) => {
  try {
    const { threshold = "10", hospitalId, vaccineId } = req.query;
    const parsedThreshold = Number(threshold);

    if (!Number.isInteger(parsedThreshold) || parsedThreshold < 0) {
      return res.status(400).json({
        success: false,
        message: "Threshold must be a non-negative integer",
      });
    }

    const query = {
      status: "Available",
      quantity: { $lte: parsedThreshold },
      expiryDate: { $gt: new Date() },
    };

    if (hospitalId) query.hospitalId = hospitalId;
    if (vaccineId) query.vaccineId = vaccineId;

    const lowStockBatches = await Batch.find(query)
      .populate("vaccineId", "name manufacturer")
      .populate("hospitalId", "name district city")
      .sort({ quantity: 1, expiryDate: 1 });

    res.status(200).json({
      success: true,
      message: "Low stock inventory fetched successfully",
      threshold: parsedThreshold,
      count: lowStockBatches.length,
      data: lowStockBatches,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid hospitalId or vaccineId format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while fetching low stock inventory",
      error: error.message,
    });
  }
};

export { getLowStockInventory };
