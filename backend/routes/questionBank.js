import express from 'express';
import {
  getQuestionsByCourse, createQuestion, updateQuestion, deleteQuestion,
  getAvailableForExam, getExamQuestions, addQuestionToExam, removeQuestionFromExam
} from '../controllers/questionBankController.js';
import { authenticate, requireInstructor } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate, requireInstructor);
router.get('/course/:courseId', getQuestionsByCourse);
router.post('/course/:courseId', createQuestion);
router.put('/:id', updateQuestion);
router.delete('/:id', deleteQuestion);
router.get('/exam/:examId/available', getAvailableForExam);
router.get('/exam/:examId/questions', getExamQuestions);
router.post('/exam/:examId/question/:questionId', addQuestionToExam);
router.delete('/exam/:examId/question/:questionId', removeQuestionFromExam);

export default router;
