import mongoose from 'mongoose';

const recordSchema = mongoose.Schema({
  // 1. Who got vaccinated? (Links to User Model)
  patientId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // 2. Was it for a dependent? (Optional)
  // If this is set, it means the record is for the child/spouse.
  // If null, it is for the User themselves.
  dependentName: { 
    type: String,
    default: null
  },

  // 3. Which Vaccine? (Links to Minidu's Vaccine Model)
  vaccineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vaccine',
    required: true
  },

  // 4. Which Batch? (Links to Minidu's Batch Model)
  // We need this to track if a specific batch causes side effects later.
  batchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
    required: true
  },

  // 5. Where did it happen? (Links to Nethmi's Hospital Model)
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },

  // 6. When did it happen?
  dateAdministered: {
    type: Date,
    default: Date.now
  },

  // 7. When is the next dose due? (Calculated logic)
  nextDoseDate: {
    type: Date
  },

  // Track if we have already sent an email alert for this overdue dose
  overdueNotified: {
    type: Boolean,
    default: false
  },

  // 8. Who gave the shot? (Links to Hospital Staff)
  administeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' 
  }
}, { timestamps: true });

export default mongoose.model('Record', recordSchema);
