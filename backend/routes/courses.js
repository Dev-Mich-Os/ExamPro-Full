import express from 'express';
import { getCourses, createCourse, updateCourse, deleteCourse } from '../controllers/courseController.js';
import { authenticate, requireInstructor } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.get('/', getCourses);
router.post('/', requireInstructor, createCourse);
router.put('/:id', requireInstructor, updateCourse);
router.delete('/:id', requireInstructor, deleteCourse);

export default router;
