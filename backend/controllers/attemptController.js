import pool from '../config/db.js';
import { gradeAttempt } from '../services/gradingService.js';

export const startAttempt = async (req, res) => {
  try {
    const { exam_id } = req.body;
    if (!exam_id) return res.status(400).json({ success: false, message: 'exam_id is required' });

    const examRes = await pool.query('SELECT * FROM examinations WHERE id=$1', [exam_id]);
    if (examRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const exam = examRes.rows[0];

    // Check question count
    const qCount = await pool.query(
      'SELECT COUNT(*) FROM exam_questions WHERE exam_id=$1', [exam_id]
    );
    if (parseInt(qCount.rows[0].count) === 0) {
      return res.status(400).json({ success: false, message: 'Exam has no questions' });
    }

    const endTime = new Date(Date.now() + exam.time_limit * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO attempts (student_id, exam_id, start_time, end_time, status)
       VALUES ($1, $2, NOW(), $3, 'in_progress') RETURNING *`,
      [req.user.id, exam_id, endTime]
    );

    return res.status(201).json({ success: true, message: 'Attempt started', data: result.rows[0] });
  } catch (err) {
    console.error('startAttempt error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const result = await pool.query(
      `SELECT a.*, e.title AS exam_title, e.time_limit, e.passing_score, c.name AS course_name
       FROM attempts a
       JOIN examinations e ON a.exam_id = e.id
       JOIN courses c ON e.course_id = c.id
       WHERE a.id=$1 AND a.student_id=$2`,
      [attemptId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    const attempt = result.rows[0];

    // Get existing answers
    const answersRes = await pool.query(
      `SELECT question_id, choice_id FROM answers WHERE attempt_id=$1`,
      [attemptId]
    );
    attempt.saved_answers = answersRes.rows;

    return res.json({ success: true, message: 'Attempt fetched', data: attempt });
  } catch (err) {
    console.error('getAttempt error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const saveAnswer = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { question_id, choice_id } = req.body;

    // Verify attempt belongs to student and is in progress
    const attemptRes = await pool.query(
      `SELECT * FROM attempts WHERE id=$1 AND student_id=$2 AND status='in_progress'`,
      [attemptId, req.user.id]
    );
    if (attemptRes.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Attempt not found or already submitted' });
    }

    // Check timer
    const attempt = attemptRes.rows[0];
    if (new Date() > new Date(attempt.end_time)) {
      // Auto-submit
      const grade = await gradeAttempt(attemptId);
      return res.status(400).json({
        success: false,
        message: 'Time expired. Exam auto-submitted.',
        data: { auto_submitted: true, ...grade }
      });
    }

    // Upsert answer
    await pool.query(
      `INSERT INTO answers (attempt_id, question_id, choice_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (attempt_id, question_id) DO UPDATE SET choice_id=$3`,
      [attemptId, question_id, choice_id]
    );

    return res.json({ success: true, message: 'Answer saved' });
  } catch (err) {
    console.error('saveAnswer error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const submitAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attemptRes = await pool.query(
      `SELECT a.*, e.time_limit FROM attempts a
       JOIN examinations e ON a.exam_id = e.id
       WHERE a.id=$1 AND a.student_id=$2 AND a.status='in_progress'`,
      [attemptId, req.user.id]
    );
    if (attemptRes.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Attempt not found or already submitted' });
    }

    // Check all questions answered
    const totalQ = await pool.query(
      `SELECT COUNT(*) FROM exam_questions WHERE exam_id=$1`,
      [attemptRes.rows[0].exam_id]
    );
    const answeredQ = await pool.query(
      `SELECT COUNT(*) FROM answers WHERE attempt_id=$1 AND choice_id IS NOT NULL`,
      [attemptId]
    );

    if (parseInt(answeredQ.rows[0].count) < parseInt(totalQ.rows[0].count)) {
      return res.status(400).json({
        success: false,
        message: `Please answer all questions. ${answeredQ.rows[0].count}/${totalQ.rows[0].count} answered.`
      });
    }

    const grade = await gradeAttempt(attemptId);

    return res.json({
      success: true,
      message: 'Exam submitted successfully',
      data: { attempt_id: parseInt(attemptId), ...grade }
    });
  } catch (err) {
    console.error('submitAttempt error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const autoSubmitAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attemptRes = await pool.query(
      `SELECT * FROM attempts WHERE id=$1 AND student_id=$2 AND status='in_progress'`,
      [attemptId, req.user.id]
    );
    if (attemptRes.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Attempt not found or already submitted' });
    }

    const grade = await gradeAttempt(attemptId);
    await pool.query(
      `UPDATE attempts SET status='auto_submitted' WHERE id=$1`,
      [attemptId]
    );

    return res.json({
      success: true,
      message: 'Exam auto-submitted (time expired)',
      data: { attempt_id: parseInt(attemptId), ...grade }
    });
  } catch (err) {
    console.error('autoSubmitAttempt error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
