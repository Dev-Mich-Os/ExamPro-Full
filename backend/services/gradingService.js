import pool from '../config/db.js';

export const gradeAttempt = async (attemptId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get attempt info
    const attemptRes = await client.query(
      `SELECT a.*, e.passing_score FROM attempts a
       JOIN examinations e ON a.exam_id = e.id
       WHERE a.id = $1`,
      [attemptId]
    );
    const attempt = attemptRes.rows[0];
    if (!attempt) throw new Error('Attempt not found');

    // Get all exam questions with correct answers
    const questionsRes = await client.query(
      `SELECT qb.id AS question_id,
         COALESCE(eq.points_override, qb.points) AS points,
         (SELECT id FROM choices WHERE bank_question_id = qb.id AND is_correct = true LIMIT 1) AS correct_choice_id
       FROM exam_questions eq
       JOIN question_bank qb ON qb.id = eq.question_id
       WHERE eq.exam_id = $1`,
      [attempt.exam_id]
    );

    let totalPoints = 0;
    let earnedPoints = 0;

    for (const q of questionsRes.rows) {
      totalPoints += parseFloat(q.points);

      // Find student's answer
      const answerRes = await client.query(
        `SELECT * FROM answers WHERE attempt_id=$1 AND question_id=$2`,
        [attemptId, q.question_id]
      );

      if (answerRes.rows.length > 0) {
        const answer = answerRes.rows[0];
        const isCorrect = answer.choice_id && answer.choice_id === q.correct_choice_id;
        const pointsEarned = isCorrect ? parseFloat(q.points) : 0;
        earnedPoints += pointsEarned;

        await client.query(
          `UPDATE answers SET is_correct=$1, points_earned=$2 WHERE id=$3`,
          [isCorrect, pointsEarned, answer.id]
        );
      }
    }

    const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const passed = percentage >= parseFloat(attempt.passing_score);

    await client.query(
      `UPDATE attempts SET score=$1, max_score=$2, percentage=$3, passed=$4,
         submit_time=NOW(), status='submitted'
       WHERE id=$5`,
      [earnedPoints, totalPoints, percentage.toFixed(2), passed, attemptId]
    );

    await client.query('COMMIT');

    return {
      score: earnedPoints,
      maxScore: totalPoints,
      percentage: parseFloat(percentage.toFixed(2)),
      passed,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
