import jwt from "jsonwebtoken";
import User from "../models/User.js";
import mongoose from "mongoose";
import { deleteImage, uploadImage } from "../services/cloudinaryService.js";
import { escapeRegex } from "../helpers/regexHelper.js";
import { isValidImageBuffer } from "../helpers/fileHelper.js";

// Helper Function: Generate JWT Token
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "30d", // Token expires in 30 days
  });
};

// Helper Function: Set JWT Token Cookie
const setTokenCookie = (res, token) => {
  res.cookie("jwt", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
const registerUser = async (req, res) => {
  // SECURITY: `role` is intentionally NOT read from req.body. Public registration
  // must never be able to choose its own role (privilege escalation, issue #1).
  const { name, email, password, nic, phone, address, dependents } = req.body;

  // 1. Check if user already exists
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  // 2. Create the user
  const user = await User.create({
    name,
    email,
    password, // (Will be hashed automatically by our Model)
    role: "Public", // Forced server-side; ignores any role sent by the client
    nic,
    phone,
    address,
    dependents,
  });

  // 3. specific response if successful
  if (user) {
    const token = generateToken(user._id, user.role);
    setTokenCookie(res, token);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture,
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data");
  }
};
// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const authUser = async (req, res) => {
  const { email, password } = req.body;

  // 1. Find user by email
  const user = await User.findOne({ email });

  // 2. Check if user exists AND password matches
  if (user && (await user.matchPassword(password))) {
    const token = generateToken(user._id, user.role);
    setTokenCookie(res, token);

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture,
    });
  } else {
    res.status(401);
    throw new Error("Invalid email or password");
  }
};

// @desc    Logout user / clear cookie
// @route   POST /api/users/logout
// @access  Public
const logoutUser = (req, res) => {
  res.cookie("jwt", "", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    expires: new Date(0),
  });
  res.status(200).json({ success: true, message: "Logged out successfully" });
};

// @desc    Search patients by NIC, name, or ObjectId (Staff/Admin only)
// @route   GET /api/users/search?q=<query>
// @access  Private (Staff/Admin)
const searchUsers = async (req, res) => {
  const { q } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Query parameter "q" is required',
    });
  }

  try {
    const query = q.trim();
    let users = [];

    // Try ObjectId match first
    if (mongoose.isValidObjectId(query)) {
      const user = await User.findById(query).select('name email nic role phone');
      if (user && user.role === 'Public') users = [user];
    }

    // If no ObjectId match, search by NIC or name
    if (users.length === 0) {
      const sanitizedQuery = escapeRegex(query);
      users = await User.find({
        role: 'Public',
        $or: [
          { nic: { $regex: `^${sanitizedQuery}`, $options: 'i' } },
          { name: { $regex: sanitizedQuery, $options: 'i' } },
        ],
      })
        .select('name email nic role phone')
        .limit(10);
    }

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error while searching patients',
      error: error.message,
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.phone = req.body.phone || user.phone;
    user.nic = req.body.nic || user.nic;
    user.address = req.body.address || user.address;

    if (req.body.password) {
      user.password = req.body.password;
    }

    // Handle profile picture upload to Cloudinary (vaxtrack/profiles folder)
    if (req.file) {
      if (!isValidImageBuffer(req.file.buffer)) {
        return res.status(400).json({
          success: false,
          message: "Invalid file content. Only genuine JPEG, PNG, and WebP images are allowed.",
        });
      }
      // Delete the old profile picture from Cloudinary if it exists
      if (user.profilePicture) {
        await deleteImage(user.profilePicture);
      }
      user.profilePicture = await uploadImage(req.file.buffer, "vaxtrack/profiles");
    }

    const updatedUser = await user.save();

    const token = generateToken(updatedUser._id, updatedUser.role);
    setTokenCookie(res, token);

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      phone: updatedUser.phone,
      nic: updatedUser.nic,
      address: updatedUser.address,
      profilePicture: updatedUser.profilePicture,
    });
  } catch (error) {
    console.error("updateUserProfile error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

export { authUser, registerUser, searchUsers, updateUserProfile, logoutUser };

