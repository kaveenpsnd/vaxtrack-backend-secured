import mongoose from 'mongoose';

const sideEffectSchema = mongoose.Schema({
  // 1. Link to the specific vaccination record
  // This tells us exactly WHICH shot caused the issue (Batch, Date, Hospital)
  recordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Record',
    required: true
  },

  // 2. Who is reporting this? (User)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // 3. What happened? (List of symptoms)
  symptoms: [{
    type: String,
    required: true
  }],

  // 4. How bad was it?
  severity: {
    type: String,
    enum: ['Mild', 'Moderate', 'Severe'],
    default: 'Mild'
  },

  // 5. When did it start?
  dateReported: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

export default mongoose.model('SideEffect', sideEffectSchema);
