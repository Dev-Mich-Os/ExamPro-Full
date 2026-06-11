import express from 'express';
import { getExams, createExam, updateExam, deleteExam, getExamForStudent } from '../controllers/examController.js';
import { authenticate, requireInstructor } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.get('/', getExams);
router.post('/', requireInstructor, createExam);
router.put('/:id', requireInstructor, updateExam);
router.delete('/:id', requireInstructor, deleteExam);
router.get('/student/:id', getExamForStudent);

export default router;
