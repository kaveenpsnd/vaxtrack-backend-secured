import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["Admin", "HospitalStaff", "Public"],
      default: "Public",
    },
    nic: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: false,
    },
    profilePicture: {
      type: String,
      required: false,
    },

    // FAMILY ARCHITECTURE:

    dependents: [
      {
        name: { type: String, required: true },
        age: { type: Number, required: true },
        gender: { type: String, enum: ["Male", "Female"] },
        relation: { type: String, required: true }, //
      },
    ],
  },
  {
    timestamps: true, // Automatically creates 'createdAt' and 'updatedAt'
  },
);

// --- SECURITY LOGIC ---

// 1. Encrypt password before saving
userSchema.pre("save", async function () {
  // If the password field hasn't changed, skip this step
  if (!this.isModified("password")) {
    return;
  }

  // Generate a "salt" (random data to make the hash unique)
  const salt = await bcrypt.genSalt(10);
  // Hash the password with the salt
  this.password = await bcrypt.hash(this.password, salt);
});

// 2. Helper to check password during Login
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Export the model so other files can use it
const User = mongoose.model("User", userSchema);
export default User;
