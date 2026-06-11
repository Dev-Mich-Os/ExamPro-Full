import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import examRoutes from './routes/exams.js';
import questionBankRoutes from './routes/questionBank.js';
import attemptRoutes from './routes/attempts.js';
import reportRoutes from './routes/reports.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/question-bank', questionBankRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Exam System API running', timestamp: new Date() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Exam System backend running on http://localhost:${PORT}`);
});
