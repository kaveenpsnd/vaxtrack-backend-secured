import mongoose from "mongoose";

const batchSchema = new mongoose.Schema(
  {
    vaccineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vaccine",
      required: [true, "Vaccine ID is required"],
      index: true,
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: [true, "Hospital ID is required"],
      index: true,
    },
    batchNumber: {
      type: String,
      required: [true, "Batch number is required"],
      trim: true,
      unique: true,
      uppercase: true,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be an integer",
      },
    },
    expiryDate: {
      type: Date,
      required: [true, "Expiry date is required"],
      validate: {
        validator: function (v) {
          // Expiry date should be in the future when creating
          return v instanceof Date && !isNaN(v);
        },
        message: "Expiry date must be a valid date",
      },
    },
    arrivalDate: {
      type: Date,
      required: [true, "Arrival date is required"],
      default: Date.now,
      validate: {
        validator: function (v) {
          return v instanceof Date && !isNaN(v);
        },
        message: "Arrival date must be a valid date",
      },
    },
    status: {
      type: String,
      required: [true, "Status is required"],
      enum: {
        values: ["Available", "Expired", "Depleted"],
        message: "Status must be one of: Available, Expired, Depleted",
      },
      default: "Available",
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual for records (if needed for population)
batchSchema.virtual("records", {
  ref: "Record",
  localField: "_id",
  foreignField: "batchId",
});

// Compound index for efficient queries
batchSchema.index({ vaccineId: 1, hospitalId: 1 });
batchSchema.index({ status: 1, expiryDate: 1 });

// Pre-save middleware to auto-update status based on expiry date
batchSchema.pre("save", function () {
  if (this.expiryDate < new Date() && this.status === "Available") {
    this.status = "Expired";
  }
  if (this.quantity === 0 && this.status === "Available") {
    this.status = "Depleted";
  }
});

// Instance method to check if batch is usable
batchSchema.methods.isUsable = function () {
  return (
    this.status === "Available" &&
    this.quantity > 0 &&
    this.expiryDate > new Date()
  );
};

// Static method to find available batches for a specific vaccine at a hospital
batchSchema.statics.findAvailableBatches = function (vaccineId, hospitalId) {
  return this.find({
    vaccineId,
    hospitalId,
    status: "Available",
    quantity: { $gt: 0 },
    expiryDate: { $gt: new Date() },
  }).sort({ expiryDate: 1 }); // FIFO - First to Expire, First Out
};

const Batch = mongoose.model("Batch", batchSchema);

export default Batch;
