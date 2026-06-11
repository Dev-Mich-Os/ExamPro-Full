import express from 'express';
import {
  getDashboardStats, getInstructorResults, getAttemptDetail,
  getStudentResults, getStudentAttemptDetail
} from '../controllers/reportController.js';
import { authenticate, requireInstructor, requireStudent } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.get('/instructor/dashboard-stats', requireInstructor, getDashboardStats);
router.get('/instructor/results', requireInstructor, getInstructorResults);
router.get('/instructor/results/:attemptId', requireInstructor, getAttemptDetail);
router.get('/student/results', requireStudent, getStudentResults);
router.get('/student/results/:attemptId', requireStudent, getStudentAttemptDetail);

export default router;
