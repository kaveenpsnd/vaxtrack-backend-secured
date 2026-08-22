import mongoose from 'mongoose';

const vaccineSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Vaccine name is required'],
            trim: true,
            unique: true,
        },
        manufacturer: {
            type: String,
            required: [true, 'Manufacturer is required'],
            trim: true,
        },
        description: {
            type: String,
            required: [true, 'Description is required'],
            trim: true,
        },
        dosesRequired: {
            type: Number,
            required: [true, 'Number of doses required is required'],
            min: [1, 'Doses required must be at least 1'],
            validate: {
                validator: Number.isInteger,
                message: 'Doses required must be an integer',
            },
        },
        daysBetweenDoses: {
            type: Number,
            required: [true, 'Days between doses is required'],
            min: [0, 'Days between doses cannot be negative'],
            validate: {
                validator: Number.isInteger,
                message: 'Days between doses must be an integer',
            },
        },
        imageUrl: {
            type: String,
            trim: true,
            default: null,
            validate: {
                validator: function (v) {
                    if (!v) return true; // Allow null/empty
                    // Basic URL validation
                    return /^https?:\/\/.+/.test(v);
                },
                message: 'Image URL must be a valid URL',
            },
        },
    },
    {
        timestamps: true, // Adds createdAt and updatedAt fields
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual for batches (if needed for population)
vaccineSchema.virtual('batches', {
    ref: 'Batch',
    localField: '_id',
    foreignField: 'vaccineId',
});

// Virtual for clinics (if needed for population)
vaccineSchema.virtual('clinics', {
    ref: 'Clinic',
    localField: '_id',
    foreignField: 'vaccineId',
});

// Index for faster queries
vaccineSchema.index({ manufacturer: 1 });

const Vaccine = mongoose.model('Vaccine', vaccineSchema);

export default Vaccine;
