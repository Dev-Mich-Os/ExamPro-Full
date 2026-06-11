import express from 'express';
import { startAttempt, getAttempt, saveAnswer, submitAttempt, autoSubmitAttempt } from '../controllers/attemptController.js';
import { authenticate, requireStudent } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate, requireStudent);
router.post('/start', startAttempt);
router.get('/:attemptId', getAttempt);
router.post('/:attemptId/answer', saveAnswer);
router.post('/:attemptId/submit', submitAttempt);
router.post('/:attemptId/auto-submit', autoSubmitAttempt);

export default router;
