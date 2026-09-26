import bcrypt from "bcryptjs";
import mongoose from "mongoose";

// Local (email + password) accounts must supply these fields at registration.
// Accounts created through WSO2 single sign-on do not have them.
const isLocalAccount = function () {
  return this.authProvider === "local";
};

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
      required: isLocalAccount,
    },
    role: {
      type: String,
      enum: ["Admin", "HospitalStaff", "Public"],
      default: "Public",
    },
    nic: {
      type: String,
      required: isLocalAccount,
    },
    phone: {
      type: String,
      required: isLocalAccount,
    },
    address: {
      type: String,
      required: false,
    },
    profilePicture: {
      type: String,
      required: false,
    },

    // SINGLE SIGN-ON (WSO2 Identity Server):
    authProvider: {
      type: String,
      enum: ["local", "wso2"],
      default: "local",
    },
    // The ID token's `sub` claim — the stable WSO2 identifier for this user.
    wso2Sub: {
      type: String,
      unique: true,
      sparse: true,
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

// NIC stays unique, but only among accounts that have one. A plain unique index
// would treat every SSO account without a NIC as a duplicate `null`.
// Existing databases need scripts/migrate-nic-index.js to replace the old index.
userSchema.index(
  { nic: 1 },
  { unique: true, partialFilterExpression: { nic: { $type: "string" } } },
);

// --- SECURITY LOGIC ---

// 1. Encrypt password before saving
userSchema.pre("save", async function () {
  // If the password field hasn't changed (or SSO accounts have none), skip this step
  if (!this.isModified("password") || !this.password) {
    return;
  }

  // Generate a "salt" (random data to make the hash unique)
  const salt = await bcrypt.genSalt(10);
  // Hash the password with the salt
  this.password = await bcrypt.hash(this.password, salt);
});

// 2. Helper to check password during Login
userSchema.methods.matchPassword = async function (enteredPassword) {
  // SSO-only accounts have no password hash; bcrypt.compare would throw.
  if (!this.password || typeof enteredPassword !== "string") {
    return false;
  }
  return await bcrypt.compare(enteredPassword, this.password);
};

// Export the model so other files can use it
const User = mongoose.model("User", userSchema);
export default User;
