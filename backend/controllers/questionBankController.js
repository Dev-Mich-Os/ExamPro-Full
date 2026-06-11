import pool from '../config/db.js';

export const getQuestionsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { difficulty, topic } = req.query;

    let query = `
      SELECT qb.*, u.username AS created_by_name,
        json_agg(
          json_build_object('id', ch.id, 'text', ch.text, 'is_correct', ch.is_correct, 'order_index', ch.order_index)
          ORDER BY ch.order_index
        ) FILTER (WHERE ch.id IS NOT NULL) AS choices,
        COUNT(DISTINCT eq.exam_id) AS used_in_exams
      FROM question_bank qb
      LEFT JOIN users u ON qb.created_by = u.id
      LEFT JOIN choices ch ON ch.bank_question_id = qb.id
      LEFT JOIN exam_questions eq ON eq.question_id = qb.id
      WHERE qb.course_id = $1
    `;
    const params = [courseId];
    let paramIdx = 2;

    if (difficulty) {
      query += ` AND qb.difficulty = $${paramIdx++}`;
      params.push(difficulty);
    }
    if (topic) {
      query += ` AND qb.topic ILIKE $${paramIdx++}`;
      params.push(`%${topic}%`);
    }

    query += ' GROUP BY qb.id, u.username ORDER BY qb.created_at DESC';

    const result = await pool.query(query, params);
    return res.json({ success: true, message: 'Questions fetched', data: result.rows });
  } catch (err) {
    console.error('getQuestionsByCourse error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createQuestion = async (req, res) => {
  const client = await pool.connect();
  try {
    const { courseId } = req.params;
    const { text, points, difficulty, topic, choices } = req.body;

    if (!text || !choices || choices.length < 2) {
      return res.status(400).json({ success: false, message: 'Question text and at least 2 choices required' });
    }
    if (!choices.some(c => c.is_correct)) {
      return res.status(400).json({ success: false, message: 'Exactly one correct answer required' });
    }
    if (choices.filter(c => c.is_correct).length > 1) {
      return res.status(400).json({ success: false, message: 'Only one correct answer allowed' });
    }

    await client.query('BEGIN');
    const qResult = await client.query(
      `INSERT INTO question_bank (course_id, text, points, difficulty, topic, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [courseId, text, points || 1, difficulty || 'medium', topic || null, req.user.id]
    );
    const question = qResult.rows[0];

    for (let i = 0; i < choices.length; i++) {
      await client.query(
        `INSERT INTO choices (bank_question_id, text, is_correct, order_index) VALUES ($1, $2, $3, $4)`,
        [question.id, choices[i].text, choices[i].is_correct, i]
      );
    }

    await client.query('COMMIT');

    const full = await pool.query(
      `SELECT qb.*, json_agg(
         json_build_object('id', ch.id, 'text', ch.text, 'is_correct', ch.is_correct, 'order_index', ch.order_index)
         ORDER BY ch.order_index
       ) AS choices FROM question_bank qb
       LEFT JOIN choices ch ON ch.bank_question_id = qb.id
       WHERE qb.id = $1 GROUP BY qb.id`,
      [question.id]
    );

    return res.status(201).json({ success: true, message: 'Question created', data: full.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createQuestion error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
};

export const updateQuestion = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { text, points, difficulty, topic, choices } = req.body;

    if (!text || !choices || choices.length < 2) {
      return res.status(400).json({ success: false, message: 'Question text and at least 2 choices required' });
    }
    if (choices.filter(c => c.is_correct).length !== 1) {
      return res.status(400).json({ success: false, message: 'Exactly one correct answer required' });
    }

    await client.query('BEGIN');
    const qResult = await client.query(
      `UPDATE question_bank SET text=$1, points=$2, difficulty=$3, topic=$4
       WHERE id=$5 RETURNING *`,
      [text, points || 1, difficulty || 'medium', topic || null, id]
    );
    if (qResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    await client.query('DELETE FROM choices WHERE bank_question_id = $1', [id]);
    for (let i = 0; i < choices.length; i++) {
      await client.query(
        `INSERT INTO choices (bank_question_id, text, is_correct, order_index) VALUES ($1, $2, $3, $4)`,
        [id, choices[i].text, choices[i].is_correct, i]
      );
    }

    await client.query('COMMIT');

    const full = await pool.query(
      `SELECT qb.*, json_agg(
         json_build_object('id', ch.id, 'text', ch.text, 'is_correct', ch.is_correct, 'order_index', ch.order_index)
         ORDER BY ch.order_index
       ) AS choices FROM question_bank qb
       LEFT JOIN choices ch ON ch.bank_question_id = qb.id
       WHERE qb.id = $1 GROUP BY qb.id`,
      [id]
    );

    return res.json({ success: true, message: 'Question updated', data: full.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateQuestion error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
};

export const deleteQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM question_bank WHERE id=$1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }
    return res.json({ success: true, message: 'Question deleted' });
  } catch (err) {
    console.error('deleteQuestion error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getAvailableForExam = async (req, res) => {
  try {
    const { examId } = req.params;
    const examRes = await pool.query('SELECT course_id FROM examinations WHERE id=$1', [examId]);
    if (examRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const courseId = examRes.rows[0].course_id;

    const result = await pool.query(
      `SELECT qb.*, json_agg(
         json_build_object('id', ch.id, 'text', ch.text, 'is_correct', ch.is_correct, 'order_index', ch.order_index)
         ORDER BY ch.order_index
       ) FILTER (WHERE ch.id IS NOT NULL) AS choices
       FROM question_bank qb
       LEFT JOIN choices ch ON ch.bank_question_id = qb.id
       WHERE qb.course_id = $1
         AND qb.id NOT IN (SELECT question_id FROM exam_questions WHERE exam_id = $2)
       GROUP BY qb.id
       ORDER BY qb.created_at DESC`,
      [courseId, examId]
    );
    return res.json({ success: true, message: 'Available questions fetched', data: result.rows });
  } catch (err) {
    console.error('getAvailableForExam error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getExamQuestions = async (req, res) => {
  try {
    const { examId } = req.params;
    const result = await pool.query(
      `SELECT qb.*, eq.order_index, eq.points_override,
         json_agg(
           json_build_object('id', ch.id, 'text', ch.text, 'is_correct', ch.is_correct, 'order_index', ch.order_index)
           ORDER BY ch.order_index
         ) FILTER (WHERE ch.id IS NOT NULL) AS choices
       FROM exam_questions eq
       JOIN question_bank qb ON qb.id = eq.question_id
       LEFT JOIN choices ch ON ch.bank_question_id = qb.id
       WHERE eq.exam_id = $1
       GROUP BY qb.id, eq.order_index, eq.points_override
       ORDER BY eq.order_index`,
      [examId]
    );
    return res.json({ success: true, message: 'Exam questions fetched', data: result.rows });
  } catch (err) {
    console.error('getExamQuestions error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const addQuestionToExam = async (req, res) => {
  try {
    const { examId, questionId } = req.params;
    const { points_override } = req.body;

    const maxOrder = await pool.query(
      'SELECT COALESCE(MAX(order_index), -1) AS max FROM exam_questions WHERE exam_id=$1',
      [examId]
    );
    const nextOrder = maxOrder.rows[0].max + 1;

    await pool.query(
      `INSERT INTO exam_questions (exam_id, question_id, order_index, points_override)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [examId, questionId, nextOrder, points_override || null]
    );
    return res.status(201).json({ success: true, message: 'Question added to exam' });
  } catch (err) {
    console.error('addQuestionToExam error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const removeQuestionFromExam = async (req, res) => {
  try {
    const { examId, questionId } = req.params;
    await pool.query(
      'DELETE FROM exam_questions WHERE exam_id=$1 AND question_id=$2',
      [examId, questionId]
    );
    return res.json({ success: true, message: 'Question removed from exam' });
  } catch (err) {
    console.error('removeQuestionFromExam error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
