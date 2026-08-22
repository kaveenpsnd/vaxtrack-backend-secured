import mongoose from 'mongoose';

const hospitalSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Hospital name is required'],
      trim: true,
      maxlength: [150, 'Hospital name cannot exceed 150 characters'],
    },

    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },

    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },

    district: {
      type: String,
      required: [true, 'District is required'],
      trim: true,
    },

    latitude: {
      type: Number,
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90'],
    },

    longitude: {
      type: Number,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180'],
    },

    contactNumber: {
      type: String,
      required: [true, 'Contact number is required'],
      trim: true,
      match: [
        /^(?:\+94|0)\d{9}$/,
        'Please provide a valid Sri Lankan phone number (e.g., +94771234567 or 0771234567)',
      ],
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Admin reference (createdBy) is required'],
    },
  },
  {
    timestamps: true,
  }
);

// ----- Indexes -----
// Unique compound index to prevent duplicate hospitals at the same location
hospitalSchema.index({ name: 1, district: 1 }, { unique: true });

// Geospatial-friendly index for potential proximity queries
hospitalSchema.index({ latitude: 1, longitude: 1 });

const Hospital = mongoose.model('Hospital', hospitalSchema);

export default Hospital;
