import Hospital from '../models/Hospital.js';
import { geocodeAddress } from '../services/geocodingService.js';

// ──────────────────────────────────────────────
// @desc    Create a new hospital
// @route   POST /api/hospitals
// @access  Admin
// ──────────────────────────────────────────────
const createHospital = async (req, res) => {
    try {
        const { name, address, city, district, latitude, longitude, contactNumber } =
            req.body;

        // ── Input Validation ──
        const missingFields = [];
        if (!name || !name.trim()) missingFields.push('name');
        if (!address || !address.trim()) missingFields.push('address');
        if (!city || !city.trim()) missingFields.push('city');
        if (!district || !district.trim()) missingFields.push('district');
        if (!contactNumber || !contactNumber.trim()) missingFields.push('contactNumber');

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`,
            });
        }

        // Validate phone number format
        const phoneRegex = /^(?:\+94|0)\d{9}$/;
        if (!phoneRegex.test(contactNumber.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid phone number format. Use +94XXXXXXXXX or 0XXXXXXXXX',
            });
        }

        // Validate lat/long ranges if provided
        if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
            return res.status(400).json({
                success: false,
                message: 'Latitude must be between -90 and 90',
            });
        }
        if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
            return res.status(400).json({
                success: false,
                message: 'Longitude must be between -180 and 180',
            });
        }

        let finalLatitude = latitude;
        let finalLongitude = longitude;

        // If lat/long not provided, try to geocode the address
        if (!latitude || !longitude) {
            try {
                console.log(`Geocoding address for hospital: ${name}`);
                const geocodeResult = await geocodeAddress(address, city);
                finalLatitude = geocodeResult.latitude;
                finalLongitude = geocodeResult.longitude;
                console.log(`✅ Geocoded successfully: ${geocodeResult.displayName}`);
            } catch (geocodeError) {
                console.error('Geocoding error:', geocodeError.message);

                // If geocoding fails, return error unless coordinates were explicitly provided
                return res.status(400).json({
                    success: false,
                    message: 'Could not geocode address. Please provide latitude and longitude manually.',
                    error: geocodeError.message,
                });
            }
        }

        const hospital = await Hospital.create({
            name,
            address,
            city,
            district,
            latitude: finalLatitude,
            longitude: finalLongitude,
            contactNumber,
            createdBy: req.user._id,
        });

        res.status(201).json({
            success: true,
            message: 'Hospital registered successfully',
            data: hospital,
            geocoded: !latitude && !longitude, // Indicate if coordinates were auto-generated
        });
    } catch (error) {
        // Handle Mongoose duplicate key error
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'A hospital with this name already exists in this district',
            });
        }

        // Handle Mongoose validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err) => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: messages,
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while creating hospital',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get all hospitals (with optional filters)
// @route   GET /api/hospitals
// @access  Public
// ──────────────────────────────────────────────
const getAllHospitals = async (req, res) => {
    try {
        const { city, district } = req.query;

        // Build dynamic filter object
        const filter = {};
        if (city) filter.city = { $regex: city, $options: 'i' };
        if (district) filter.district = { $regex: district, $options: 'i' };

        const hospitals = await Hospital.find(filter)
            // TODO: Add .populate('createdBy', 'name email') once User model is ready
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: hospitals.length,
            data: hospitals,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error while fetching hospitals',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Get a single hospital by ID
// @route   GET /api/hospitals/:id
// @access  Public
// ──────────────────────────────────────────────
const getHospitalById = async (req, res) => {
    try {
        // TODO: Add .populate('createdBy', 'name email') once User model is ready
        const hospital = await Hospital.findById(req.params.id);

        if (!hospital) {
            return res.status(404).json({
                success: false,
                message: 'Hospital not found',
            });
        }

        res.status(200).json({
            success: true,
            data: hospital,
        });
    } catch (error) {
        // Handle invalid ObjectId format
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid hospital ID format',
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while fetching hospital',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Update a hospital
// @route   PUT /api/hospitals/:id
// @access  Admin
// ──────────────────────────────────────────────
const updateHospital = async (req, res) => {
    try {
        let hospital = await Hospital.findById(req.params.id);

        if (!hospital) {
            return res.status(404).json({
                success: false,
                message: 'Hospital not found',
            });
        }

        const { name, address, city, district, latitude, longitude, contactNumber } =
            req.body;

        let updateData = { name, address, city, district, latitude, longitude, contactNumber };

        // Remove undefined fields so we don't overwrite with null
        Object.keys(updateData).forEach(
            (key) => updateData[key] === undefined && delete updateData[key]
        );

        // ── Input Validation ──
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No update fields provided',
            });
        }

        // Validate phone format if being updated
        if (contactNumber) {
            const phoneRegex = /^(?:\+94|0)\d{9}$/;
            if (!phoneRegex.test(contactNumber.trim())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid phone number format. Use +94XXXXXXXXX or 0XXXXXXXXX',
                });
            }
        }

        // Validate lat/long ranges if being updated
        if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
            return res.status(400).json({
                success: false,
                message: 'Latitude must be between -90 and 90',
            });
        }
        if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
            return res.status(400).json({
                success: false,
                message: 'Longitude must be between -180 and 180',
            });
        }

        // Don't allow empty strings for key fields
        if (name !== undefined && !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Hospital name cannot be empty',
            });
        }

        hospital = await Hospital.findByIdAndUpdate(req.params.id, updateData, {
            new: true,
            runValidators: true,
        });

        res.status(200).json({
            success: true,
            message: 'Hospital updated successfully',
            data: hospital,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'A hospital with this name already exists in this district',
            });
        }

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err) => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: messages,
            });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid hospital ID format',
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while updating hospital',
            error: error.message,
        });
    }
};

// ──────────────────────────────────────────────
// @desc    Delete a hospital
// @route   DELETE /api/hospitals/:id
// @access  Admin
// ──────────────────────────────────────────────
const deleteHospital = async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);

        if (!hospital) {
            return res.status(404).json({
                success: false,
                message: 'Hospital not found',
            });
        }

        await hospital.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Hospital deleted successfully',
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid hospital ID format',
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while deleting hospital',
            error: error.message,
        });
    }
};

export {
    createHospital,
    getAllHospitals,
    getHospitalById,
    updateHospital,
    deleteHospital,
};
