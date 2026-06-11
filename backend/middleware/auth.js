import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Check blacklist
    const blacklisted = await pool.query(
      'SELECT id FROM token_blacklist WHERE token = $1',
      [token]
    );
    if (blacklisted.rows.length > 0) {
      return res.status(401).json({ success: false, message: 'Token has been invalidated' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const requireInstructor = (req, res, next) => {
  if (req.user.role !== 'instructor') {
    return res.status(403).json({ success: false, message: 'Instructor access required' });
  }
  next();
};

export const requireStudent = (req, res, next) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ success: false, message: 'Student access required' });
  }
  next();
};
