import mongoose from "mongoose";

/**
 * Appointment Model — Saniru's Module (Appointments & Queue)
 *
 * Core logic:
 *  - An appointment links a Clinic to a User (and optionally a Dependent).
 *  - If dependentId is null  → the appointment is for the User themselves.
 *  - If dependentId is set   → the appointment is for that Dependent (child/elder).
 *  - queueNumber is assigned automatically (per-clinic sequential counter).
 *  - qrCodeUrl is populated by the controller after calling the goqr.me API.
 */

const appointmentSchema = new mongoose.Schema(
  {
    // ── Core References ──────────────────────────────────────────────────
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: [true, "Clinic reference is required"],
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      index: true,
    },

    /**
     * Optional — present when booking on behalf of a Dependent.
     * null means the appointment is for the User (self-booking).
     */
    dependentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dependent",
      default: null,
      index: true,
    },

    // ── Queue ────────────────────────────────────────────────────────────
    /**
     * Sequential number within the clinic session.
     * Auto-assigned in the pre-save hook; do NOT set manually.
     */
    queueNumber: {
      type: Number,
      min: [1, "Queue number must be at least 1"],
    },

    // ── Status ───────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: {
        values: ["Pending", "Completed", "Cancelled", "No-Show"],
        message:
          "Status must be one of: Pending, Completed, Cancelled, No-Show",
      },
      default: "Pending",
    },

    // ── QR Code ──────────────────────────────────────────────────────────
    /**
     * URL of the QR code image generated via the goqr.me API.
     * Populated by the appointment controller after booking succeeds.
     */
    qrCodeUrl: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Timestamps (manual) ──────────────────────────────────────────────
    bookedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Virtuals ─────────────────────────────────────────────────────────────────

/** True when the appointment is still actionable (not yet resolved). */
appointmentSchema.virtual("isActive").get(function () {
  return this.status === "Pending";
});

/** True when the appointment is for a dependent (not the account holder). */
appointmentSchema.virtual("isForDependent").get(function () {
  return this.dependentId !== null && this.dependentId !== undefined;
});

// ── Indexes ───────────────────────────────────────────────────────────────────

// Enforce one active booking per patient (user OR dependent) per clinic
appointmentSchema.index(
  { clinicId: 1, userId: 1, dependentId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["Pending", "Completed"] } },
    name: "unique_active_booking_per_patient_per_clinic",
  },
);

// Fast lookups for a user's appointment history
appointmentSchema.index({ userId: 1, status: 1 });

// Fast lookups for all appointments in a clinic (staff view / queue board)
appointmentSchema.index({ clinicId: 1, queueNumber: 1 });

// ── Pre-save Hook: Auto-assign queueNumber ────────────────────────────────────

/**
 * Before saving a NEW appointment, count how many appointments already exist
 * for the same clinic and assign the next sequential queue number.
 *
 * This is intentionally simple (count + 1). For high-concurrency production
 * systems you would use a MongoDB atomic counter, but this is sufficient for
 * a clinic-scale application.
 */
appointmentSchema.pre("save", async function () {
  if (this.isNew && !this.queueNumber) {
    const count = await mongoose.model("Appointment").countDocuments({
      clinicId: this.clinicId,
    });
    this.queueNumber = count + 1;
  }
});

// ── Instance Methods ──────────────────────────────────────────────────────────

/**
 * Cancel this appointment.
 * Returns the saved document so the caller can use it directly.
 */
appointmentSchema.methods.cancel = async function () {
  if (this.status !== "Pending") {
    throw new Error(
      `Cannot cancel an appointment with status "${this.status}"`,
    );
  }
  this.status = "Cancelled";
  return this.save();
};

/**
 * Mark this appointment as completed (used by Hospital Staff).
 */
appointmentSchema.methods.markCompleted = async function () {
  if (this.status !== "Pending") {
    throw new Error(
      `Cannot complete an appointment with status "${this.status}"`,
    );
  }
  this.status = "Completed";
  return this.save();
};

/**
 * Mark this appointment as a no-show (used by Hospital Staff).
 */
appointmentSchema.methods.markNoShow = async function () {
  if (this.status !== "Pending") {
    throw new Error(
      `Cannot mark as No-Show an appointment with status "${this.status}"`,
    );
  }
  this.status = "No-Show";
  return this.save();
};

// ── Static Methods ────────────────────────────────────────────────────────────

/**
 * Find all appointments for a given user (including those for their dependents).
 * Sorted by bookedAt descending (most recent first).
 */
appointmentSchema.statics.findByUser = function (userId) {
  return this.find({ userId })
    .populate("clinicId", "date startTime endTime vaccineType hospital")
    .populate("dependentId", "name relationship dateOfBirth")
    .sort({ bookedAt: -1 });
};

/**
 * Find all appointments for a specific clinic session (queue board view).
 * Sorted by queueNumber ascending.
 */
appointmentSchema.statics.findByClinic = function (clinicId) {
  return this.find({ clinicId })
    .populate("userId", "name email phone")
    .populate("dependentId", "name relationship")
    .sort({ queueNumber: 1 });
};

/**
 * Check whether a patient (user or dependent) already has an active booking
 * for a given clinic.
 *
 * @param {ObjectId} clinicId
 * @param {ObjectId} userId
 * @param {ObjectId|null} dependentId  — null for self-booking
 * @returns {Promise<boolean>}
 */
appointmentSchema.statics.hasActiveBooking = async function (
  clinicId,
  userId,
  dependentId = null,
) {
  const query = {
    clinicId,
    userId,
    dependentId: dependentId ?? null,
    status: { $in: ["Pending", "Completed"] },
  };
  const existing = await this.findOne(query);
  return !!existing;
};

// ── Model Export ──────────────────────────────────────────────────────────────

const Appointment = mongoose.model("Appointment", appointmentSchema);

export default Appointment;
