import mongoose from 'mongoose';

const clinicSchema = new mongoose.Schema(
    {
        hospital: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Hospital',
            required: [true, 'Hospital reference is required'],
        },

        date: {
            type: Date,
            required: [true, 'Clinic date is required'],
        },

        startTime: {
            type: String,
            required: [true, 'Start time is required'],
            match: [
                /^([01]\d|2[0-3]):([0-5]\d)$/,
                'Start time must be in HH:mm 24-hour format (e.g., 09:00)',
            ],
        },

        endTime: {
            type: String,
            required: [true, 'End time is required'],
            match: [
                /^([01]\d|2[0-3]):([0-5]\d)$/,
                'End time must be in HH:mm 24-hour format (e.g., 17:00)',
            ],
        },

        capacity: {
            type: Number,
            required: [true, 'Capacity is required'],
            min: [1, 'Capacity must be at least 1'],
        },

        bookedCount: {
            type: Number,
            default: 0,
            min: [0, 'Booked count cannot be negative'],
        },

        vaccineType: {
            type: String,
            required: [true, 'Vaccine type is required'],
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

// ----- Virtual: Check if clinic is fully booked -----
clinicSchema.virtual('isFull').get(function () {
    return this.bookedCount >= this.capacity;
});

// ----- Virtual: Remaining slots -----
clinicSchema.virtual('availableSlots').get(function () {
    return Math.max(this.capacity - this.bookedCount, 0);
});

// Include virtuals in JSON and Object output
clinicSchema.set('toJSON', { virtuals: true });
clinicSchema.set('toObject', { virtuals: true });

// ----- Pre-validate hooks -----
clinicSchema.pre('validate', function () {
    // 1. Check: endTime must be after startTime
    if (this.startTime && this.endTime && this.startTime >= this.endTime) {
        this.invalidate('endTime', 'End time must be after start time');
    }

    // 2. Check: Prevent scheduling clinics in the past
    if (this.isNew && this.date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const clinicDate = new Date(this.date);
        clinicDate.setHours(0, 0, 0, 0);

        if (clinicDate < today) {
            this.invalidate('date', 'Cannot schedule a clinic session in the past');
        }
    }
});

// ----- Check for overlapping clinic sessions -----

clinicSchema.statics.checkOverlap = async function (
    hospitalId,
    date,
    startTime,
    endTime,
    excludeId = null
) {
    // Normalize date to match the calendar day
    const clinicDate = new Date(date);
    const dayStart = new Date(clinicDate.setHours(0, 0, 0, 0));
    const dayEnd = new Date(clinicDate.setHours(23, 59, 59, 999));

    const query = {
        hospital: hospitalId,
        date: { $gte: dayStart, $lte: dayEnd },
        // Overlap condition: newStart < existingEnd AND newEnd > existingStart
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
    };

    // Exclude self when updating an existing clinic
    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    return this.findOne(query);
};

// ----- Indexes -----
// Compound index for efficient overlap queries
clinicSchema.index({
    hospital: 1,
    date: 1,
    startTime: 1,
    endTime: 1
});

// Fast lookups by date (for schedule views)
clinicSchema.index({ date: 1 });

const Clinic = mongoose.model('Clinic', clinicSchema);

export default Clinic;
