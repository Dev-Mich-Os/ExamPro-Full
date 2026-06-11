import pool from '../config/db.js';

export const getExams = async (req, res) => {
  try {
    const { course_id } = req.query;
    let query = `
      SELECT e.*, c.name AS course_name,
        COUNT(DISTINCT eq.question_id) AS question_count
      FROM examinations e
      LEFT JOIN courses c ON e.course_id = c.id
      LEFT JOIN exam_questions eq ON eq.exam_id = e.id
    `;
    const params = [];
    if (course_id) {
      query += ' WHERE e.course_id = $1';
      params.push(course_id);
    }
    query += ' GROUP BY e.id, c.name ORDER BY e.created_at DESC';

    const result = await pool.query(query, params);
    return res.json({ success: true, message: 'Exams fetched', data: result.rows });
  } catch (err) {
    console.error('getExams error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createExam = async (req, res) => {
  try {
    const { title, description, course_id, time_limit, passing_score } = req.body;
    if (!title || !course_id) {
      return res.status(400).json({ success: false, message: 'Title and course_id are required' });
    }
    const result = await pool.query(
      `INSERT INTO examinations (title, description, course_id, time_limit, passing_score, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, description || null, course_id, time_limit || 60, passing_score || 50, req.user.id]
    );
    return res.status(201).json({ success: true, message: 'Exam created', data: result.rows[0] });
  } catch (err) {
    console.error('createExam error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateExam = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, time_limit, passing_score } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' });

    const result = await pool.query(
      `UPDATE examinations SET title=$1, description=$2, time_limit=$3, passing_score=$4
       WHERE id=$5 RETURNING *`,
      [title, description || null, time_limit || 60, passing_score || 50, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    return res.json({ success: true, message: 'Exam updated', data: result.rows[0] });
  } catch (err) {
    console.error('updateExam error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const deleteExam = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM examinations WHERE id=$1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    return res.json({ success: true, message: 'Exam deleted' });
  } catch (err) {
    console.error('deleteExam error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// For students - no correct answers
export const getExamForStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const examResult = await pool.query(
      `SELECT e.*, c.name AS course_name
       FROM examinations e LEFT JOIN courses c ON e.course_id = c.id
       WHERE e.id = $1`,
      [id]
    );
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const exam = examResult.rows[0];

    const questionsResult = await pool.query(
      `SELECT qb.id, qb.text, qb.difficulty, qb.topic,
         COALESCE(eq.points_override, qb.points) AS points,
         eq.order_index
       FROM exam_questions eq
       JOIN question_bank qb ON qb.id = eq.question_id
       WHERE eq.exam_id = $1
       ORDER BY eq.order_index`,
      [id]
    );

    for (const q of questionsResult.rows) {
      const choicesResult = await pool.query(
        `SELECT id, text, order_index FROM choices
         WHERE bank_question_id = $1 ORDER BY order_index`,
        [q.id]
      );
      q.choices = choicesResult.rows;
    }

    exam.questions = questionsResult.rows;
    return res.json({ success: true, message: 'Exam fetched', data: exam });
  } catch (err) {
    console.error('getExamForStudent error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
