import pool from '../config/db.js';

export const getCourses = async (req, res) => {
  try {
    let query;
    if (req.user.role === 'instructor') {
      query = `
        SELECT c.*, u.username AS created_by_name,
          COUNT(DISTINCT e.id) AS exam_count,
          COUNT(DISTINCT qb.id) AS question_count
        FROM courses c
        LEFT JOIN users u ON c.created_by = u.id
        LEFT JOIN examinations e ON e.course_id = c.id
        LEFT JOIN question_bank qb ON qb.course_id = c.id
        GROUP BY c.id, u.username
        ORDER BY c.created_at DESC
      `;
    } else {
      query = `
        SELECT c.id, c.name, c.description,
          COUNT(DISTINCT e.id) AS exam_count
        FROM courses c
        LEFT JOIN examinations e ON e.course_id = c.id
        GROUP BY c.id
        ORDER BY c.name
      `;
    }
    const result = await pool.query(query);
    return res.json({ success: true, message: 'Courses fetched', data: result.rows });
  } catch (err) {
    console.error('getCourses error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createCourse = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Course name is required' });

    const result = await pool.query(
      'INSERT INTO courses (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, req.user.id]
    );
    return res.status(201).json({ success: true, message: 'Course created', data: result.rows[0] });
  } catch (err) {
    console.error('createCourse error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Course name is required' });

    const result = await pool.query(
      'UPDATE courses SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name, description || null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    return res.json({ success: true, message: 'Course updated', data: result.rows[0] });
  } catch (err) {
    console.error('updateCourse error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM courses WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    return res.json({ success: true, message: 'Course deleted' });
  } catch (err) {
    console.error('deleteCourse error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
