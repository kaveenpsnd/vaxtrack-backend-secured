import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const protect = async (req, res, next) => {
  let token;

  // Extract token from cookie (req.cookies.jwt)
  if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (token) {
    try {
      // 1. Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 2. Get user from the token (exclude password)
      // This attaches the user object to the request object
      // so we can access it in our routes as req.user
      req.user = await User.findById(decoded.id).select('-password');

      // If the user no longer exists, treat this as unauthorized
      if (!req.user) {
        res.status(401);
        throw new Error('Not authorized, user not found');
      }
      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error('Not authorized, token failed');
    }
  } else {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'Admin') {
    next();
  } else {
    res.status(403);
    throw new Error('Not authorized as an admin');
  }
};

const staffOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'HospitalStaff' || req.user.role === 'Admin')) {
    next();
  } else {
    res.status(403);
    throw new Error('Not authorized as hospital staff');
  }
};

export { protect, adminOnly, staffOnly };