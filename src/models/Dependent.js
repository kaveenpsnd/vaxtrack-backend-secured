import mongoose from 'mongoose';

const dependentSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User ID is required'],
            index: true,
        },
        sharedWithUserIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                index: true,
            },
        ],
        name: {
            type: String,
            required: [true, 'Dependent name is required'],
            trim: true,
        },
        nic: {
            type: String,
            trim: true,
            sparse: true, // Allow multiple null values; uniqueness for non-null values is not enforced here
            validate: {
                validator: function (v) {
                    if (!v) return true; // Allow empty/null for minors without NIC
                    // Basic NIC validation (can be customized based on country format)
                    return /^[0-9]{9}[vVxX]$|^[0-9]{12}$/.test(v);
                },
                message: 'NIC must be in valid format (9 digits + V/X or 12 digits)',
            },
        },
        dateOfBirth: {
            type: Date,
            required: [true, 'Date of birth is required'],
            validate: {
                validator: function (v) {
                    // Date of birth must be in the past
                    return v instanceof Date && !isNaN(v) && v < new Date();
                },
                message: 'Date of birth must be a valid date in the past',
            },
        },
        relationship: {
            type: String,
            required: [true, 'Relationship is required'],
            enum: {
                values: ['Child', 'Parent', 'Spouse', 'Sibling', 'Grandparent', 'Grandchild', 'Other'],
                message: 'Relationship must be one of: Child, Parent, Spouse, Sibling, Grandparent, Grandchild, Other',
            },
        },
        linkedUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        gender: {
            type: String,
            required: [true, 'Gender is required'],
            enum: {
                values: ['Male', 'Female', 'Other'],
                message: 'Gender must be one of: Male, Female, Other',
            },
        },
        medicalNotes: {
            type: String,
            trim: true,
            default: '',
            maxlength: [1000, 'Medical notes cannot exceed 1000 characters'],
        },
    },
    {
        timestamps: true, // Adds createdAt and updatedAt fields
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual for appointments (if needed for population)
dependentSchema.virtual('appointments', {
    ref: 'Appointment',
    localField: '_id',
    foreignField: 'dependentId',
});

// Virtual for records (if needed for population)
dependentSchema.virtual('records', {
    ref: 'Record',
    localField: '_id',
    foreignField: 'dependentId',
});

// Virtual to calculate age in years
dependentSchema.virtual('age').get(function () {
    if (!this.dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
});

// Virtual to calculate age in months
dependentSchema.virtual('ageInMonths').get(function () {
    if (!this.dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);

    let months = (today.getFullYear() - birthDate.getFullYear()) * 12;
    months += today.getMonth() - birthDate.getMonth();

    // Adjust if the day hasn't occurred yet this month
    if (today.getDate() < birthDate.getDate()) {
        months--;
    }

    return Math.max(0, months);
});

// Virtual to calculate age in weeks
dependentSchema.virtual('ageInWeeks').get(function () {
    if (!this.dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);

    const diffTime = today - birthDate;
    const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));

    return Math.max(0, diffWeeks);
});

// Virtual to get a smart age display (automatically chooses best unit)
dependentSchema.virtual('ageDisplay').get(function () {
    if (!this.dateOfBirth) return null;

    const weeks = this.ageInWeeks;
    const months = this.ageInMonths;
    const years = this.age;

    // For infants under 8 weeks, show weeks
    if (weeks < 8) {
        return `${weeks} week${weeks !== 1 ? 's' : ''}`;
    }

    // For babies under 24 months, show months
    if (months < 24) {
        return `${months} month${months !== 1 ? 's' : ''}`;
    }

    // For children 2 years and older, show years
    return `${years} year${years !== 1 ? 's' : ''}`;
});

// Virtual to check if dependent is a minor
dependentSchema.virtual('isMinor').get(function () {
    return this.age !== null && this.age < 18;
});

// Compound index for efficient queries
dependentSchema.index({ userId: 1, name: 1 });
dependentSchema.index({ userId: 1, relationship: 1 });
dependentSchema.index({ linkedUserId: 1, relationship: 1 });

// Instance method to get full profile
dependentSchema.methods.getProfile = function () {
    return {
        id: this._id,
        name: this.name,
        nic: this.nic,
        ownerUserId: this.userId,
        sharedWithUserIds: this.sharedWithUserIds,
        dateOfBirth: this.dateOfBirth,
        age: this.age,
        ageInMonths: this.ageInMonths,
        ageInWeeks: this.ageInWeeks,
        ageDisplay: this.ageDisplay,
        isMinor: this.isMinor,
        relationship: this.relationship,
        linkedUserId: this.linkedUserId,
        gender: this.gender,
        medicalNotes: this.medicalNotes,
    };
};

// Static method to find all dependents for a user
dependentSchema.statics.findByUser = function (userId) {
    return this.find({
        $or: [{ userId }, { sharedWithUserIds: userId }],
    }).sort({ dateOfBirth: -1 }); // Newest first
};

// Static method to find minors for a user
dependentSchema.statics.findMinorsByUser = function (userId) {
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);

    return this.find({
        $or: [{ userId }, { sharedWithUserIds: userId }],
        dateOfBirth: { $gt: eighteenYearsAgo },
    }).sort({ dateOfBirth: -1 });
};

const Dependent = mongoose.model('Dependent', dependentSchema);

export default Dependent;
