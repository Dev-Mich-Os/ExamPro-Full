import pool from '../config/db.js';

// ── INSTRUCTOR ROUTES ──────────────────────────────────────────

export const getDashboardStats = async (req, res) => {
  try {
    const [students, courses, exams, questions, attempts, scores, topStudents, recent] =
      await Promise.all([
        pool.query(`SELECT COUNT(*) FROM users WHERE role='student'`),
        pool.query(`SELECT COUNT(*) FROM courses`),
        pool.query(`SELECT COUNT(*) FROM examinations`),
        pool.query(`SELECT COUNT(*) FROM question_bank`),
        pool.query(`SELECT COUNT(*) FROM attempts WHERE status IN ('submitted','auto_submitted')`),
        pool.query(`SELECT AVG(percentage) AS avg_score,
                      COUNT(*) FILTER (WHERE passed=true) AS pass_count,
                      COUNT(*) AS total
                    FROM attempts WHERE status IN ('submitted','auto_submitted')`),
        pool.query(`SELECT u.username, COUNT(a.id) AS attempts,
                      AVG(a.percentage) AS avg_score,
                      COUNT(a.id) FILTER (WHERE a.passed=true) AS passes
                    FROM users u
                    JOIN attempts a ON a.student_id = u.id
                    WHERE u.role='student' AND a.status IN ('submitted','auto_submitted')
                    GROUP BY u.id, u.username
                    ORDER BY avg_score DESC LIMIT 5`),
        pool.query(`SELECT a.id, a.submit_time, a.percentage, a.passed,
                      u.username AS student, e.title AS exam
                    FROM attempts a
                    JOIN users u ON a.student_id = u.id
                    JOIN examinations e ON a.exam_id = e.id
                    WHERE a.status IN ('submitted','auto_submitted')
                    ORDER BY a.submit_time DESC LIMIT 10`),
      ]);

    const sc = scores.rows[0];
    const passRate = sc.total > 0 ? (sc.pass_count / sc.total) * 100 : 0;

    return res.json({
      success: true,
      message: 'Dashboard stats fetched',
      data: {
        totalStudents: parseInt(students.rows[0].count),
        totalCourses: parseInt(courses.rows[0].count),
        totalExams: parseInt(exams.rows[0].count),
        totalQuestions: parseInt(questions.rows[0].count),
        totalAttempts: parseInt(attempts.rows[0].count),
        avgScore: sc.avg_score ? parseFloat(sc.avg_score).toFixed(1) : '0.0',
        passRate: passRate.toFixed(1),
        topStudents: topStudents.rows,
        recentActivity: recent.rows,
      }
    });
  } catch (err) {
    console.error('getDashboardStats error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getInstructorResults = async (req, res) => {
  try {
    const { student_id, course_id, exam_id, date_from, date_to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let conditions = [`a.status IN ('submitted','auto_submitted')`];
    const params = [];
    let pIdx = 1;

    if (student_id) { conditions.push(`a.student_id=$${pIdx++}`); params.push(student_id); }
    if (exam_id) { conditions.push(`a.exam_id=$${pIdx++}`); params.push(exam_id); }
    if (course_id) { conditions.push(`e.course_id=$${pIdx++}`); params.push(course_id); }
    if (date_from) { conditions.push(`a.submit_time>=$${pIdx++}`); params.push(date_from); }
    if (date_to) { conditions.push(`a.submit_time<=$${pIdx++}`); params.push(date_to); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [results, stats, total] = await Promise.all([
      pool.query(`
        SELECT a.id, a.score, a.max_score, a.percentage, a.passed, a.submit_time, a.status,
          u.username AS student, e.title AS exam, c.name AS course
        FROM attempts a
        JOIN users u ON a.student_id = u.id
        JOIN examinations e ON a.exam_id = e.id
        JOIN courses c ON e.course_id = c.id
        ${where}
        ORDER BY a.submit_time DESC
        LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
        [...params, limit, offset]),
      pool.query(`
        SELECT COUNT(*) AS total, AVG(a.percentage) AS avg_score,
          COUNT(*) FILTER (WHERE a.passed=true) AS pass_count,
          COUNT(*) FILTER (WHERE a.passed=false) AS fail_count
        FROM attempts a
        JOIN examinations e ON a.exam_id = e.id
        ${where}`,
        params),
      pool.query(`
        SELECT COUNT(*) FROM attempts a
        JOIN examinations e ON a.exam_id = e.id
        ${where}`,
        params),
    ]);

    const s = stats.rows[0];
    return res.json({
      success: true,
      message: 'Results fetched',
      data: {
        results: results.rows,
        stats: {
          total: parseInt(s.total),
          avgScore: s.avg_score ? parseFloat(s.avg_score).toFixed(1) : '0.0',
          passCount: parseInt(s.pass_count),
          failCount: parseInt(s.fail_count),
          passRate: s.total > 0 ? ((s.pass_count / s.total) * 100).toFixed(1) : '0.0',
        },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(total.rows[0].count) }
      }
    });
  } catch (err) {
    console.error('getInstructorResults error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getAttemptDetail = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attemptRes = await pool.query(`
      SELECT a.*, u.username AS student, e.title AS exam,
        e.passing_score, c.name AS course
      FROM attempts a
      JOIN users u ON a.student_id = u.id
      JOIN examinations e ON a.exam_id = e.id
      JOIN courses c ON e.course_id = c.id
      WHERE a.id=$1`, [attemptId]);

    if (attemptRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    const answersRes = await pool.query(`
      SELECT an.*, qb.text AS question_text, qb.difficulty, qb.topic,
        ch.text AS chosen_answer,
        (SELECT text FROM choices WHERE bank_question_id=qb.id AND is_correct=true LIMIT 1) AS correct_answer,
        COALESCE(eq.points_override, qb.points) AS max_points
      FROM answers an
      JOIN question_bank qb ON an.question_id = qb.id
      LEFT JOIN choices ch ON an.choice_id = ch.id
      LEFT JOIN exam_questions eq ON eq.exam_id=$2 AND eq.question_id=qb.id
      WHERE an.attempt_id=$1
      ORDER BY eq.order_index`, [attemptId, attemptRes.rows[0].exam_id]);

    return res.json({
      success: true,
      message: 'Attempt detail fetched',
      data: { attempt: attemptRes.rows[0], answers: answersRes.rows }
    });
  } catch (err) {
    console.error('getAttemptDetail error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── STUDENT ROUTES ─────────────────────────────────────────────

export const getStudentResults = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.score, a.max_score, a.percentage, a.passed,
        a.submit_time, a.status, e.title AS exam, c.name AS course
      FROM attempts a
      JOIN examinations e ON a.exam_id = e.id
      JOIN courses c ON e.course_id = c.id
      WHERE a.student_id=$1 AND a.status IN ('submitted','auto_submitted')
      ORDER BY a.submit_time DESC`,
      [req.user.id]);

    return res.json({ success: true, message: 'Student results fetched', data: result.rows });
  } catch (err) {
    console.error('getStudentResults error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getStudentAttemptDetail = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attemptRes = await pool.query(`
      SELECT a.*, e.title AS exam, e.passing_score, c.name AS course
      FROM attempts a
      JOIN examinations e ON a.exam_id = e.id
      JOIN courses c ON e.course_id = c.id
      WHERE a.id=$1 AND a.student_id=$2`,
      [attemptId, req.user.id]);

    if (attemptRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    const answersRes = await pool.query(`
      SELECT an.*, qb.text AS question_text, qb.difficulty, qb.topic,
        ch.text AS chosen_answer,
        (SELECT text FROM choices WHERE bank_question_id=qb.id AND is_correct=true LIMIT 1) AS correct_answer,
        COALESCE(eq.points_override, qb.points) AS max_points,
        json_agg(
          json_build_object('id', allch.id, 'text', allch.text, 'is_correct', allch.is_correct)
          ORDER BY allch.order_index
        ) AS all_choices
      FROM answers an
      JOIN question_bank qb ON an.question_id = qb.id
      LEFT JOIN choices ch ON an.choice_id = ch.id
      LEFT JOIN choices allch ON allch.bank_question_id = qb.id
      LEFT JOIN exam_questions eq ON eq.exam_id=$2 AND eq.question_id=qb.id
      WHERE an.attempt_id=$1
      GROUP BY an.id, qb.id, ch.text, eq.points_override, eq.order_index
      ORDER BY eq.order_index`,
      [attemptId, attemptRes.rows[0].exam_id]);

    return res.json({
      success: true,
      message: 'Student attempt detail fetched',
      data: { attempt: attemptRes.rows[0], answers: answersRes.rows }
    });
  } catch (err) {
    console.error('getStudentAttemptDetail error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
