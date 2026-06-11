-- ============================================================
-- ONLINE EXAMINATION SYSTEM - PostgreSQL Setup
-- Run this entire script in pgAdmin Query Tool
-- ============================================================

-- Drop tables if they exist (clean slate)
DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS attempts CASCADE;
DROP TABLE IF EXISTS exam_questions CASCADE;
DROP TABLE IF EXISTS choices CASCADE;
DROP TABLE IF EXISTS question_bank CASCADE;
DROP TABLE IF EXISTS examinations CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS token_blacklist CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('instructor', 'student')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TOKEN BLACKLIST (logout)
-- ============================================================
CREATE TABLE token_blacklist (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL,
    blacklisted_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- COURSES
-- ============================================================
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- EXAMINATIONS
-- ============================================================
CREATE TABLE examinations (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    time_limit INTEGER NOT NULL DEFAULT 60,   -- minutes
    passing_score NUMERIC(5,2) NOT NULL DEFAULT 50.00, -- percentage
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- QUESTION BANK (reusable questions per course)
-- ============================================================
CREATE TABLE question_bank (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    points NUMERIC(6,2) NOT NULL DEFAULT 1.00,
    difficulty VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    topic VARCHAR(100),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CHOICES (answer options for each question)
-- ============================================================
CREATE TABLE choices (
    id SERIAL PRIMARY KEY,
    bank_question_id INTEGER NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    order_index INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- EXAM QUESTIONS (links questions from bank to an exam)
-- ============================================================
CREATE TABLE exam_questions (
    exam_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    points_override NUMERIC(6,2),   -- NULL = use question_bank.points
    PRIMARY KEY (exam_id, question_id)
);

-- ============================================================
-- ATTEMPTS (each student exam session)
-- ============================================================
CREATE TABLE attempts (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exam_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
    start_time TIMESTAMP NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP,           -- when timer was supposed to end
    submit_time TIMESTAMP,        -- when actually submitted
    score NUMERIC(8,2),
    max_score NUMERIC(8,2),
    percentage NUMERIC(5,2),
    passed BOOLEAN,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'auto_submitted'))
);

-- ============================================================
-- ANSWERS (student responses per attempt)
-- ============================================================
CREATE TABLE answers (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
    choice_id INTEGER REFERENCES choices(id) ON DELETE SET NULL,
    is_correct BOOLEAN,
    points_earned NUMERIC(6,2) DEFAULT 0,
    UNIQUE (attempt_id, question_id)
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_examinations_course ON examinations(course_id);
CREATE INDEX idx_question_bank_course ON question_bank(course_id);
CREATE INDEX idx_choices_question ON choices(bank_question_id);
CREATE INDEX idx_exam_questions_exam ON exam_questions(exam_id);
CREATE INDEX idx_exam_questions_question ON exam_questions(question_id);
CREATE INDEX idx_attempts_student ON attempts(student_id);
CREATE INDEX idx_attempts_exam ON attempts(exam_id);
CREATE INDEX idx_answers_attempt ON answers(attempt_id);
CREATE INDEX idx_token_blacklist ON token_blacklist(token);

-- ============================================================
-- SEED DATA - Default instructor account
-- Password: admin123 (bcrypt hash)
-- ============================================================
INSERT INTO users (username, password, role) VALUES
('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'instructor');

-- NOTE: The default password hash above is for 'password'
-- You should register a proper instructor via the app.
-- Or update: UPDATE users SET password = '<bcrypt_hash>' WHERE username = 'admin';

SELECT 'Database setup complete!' AS status;
SELECT 'Tables created: users, token_blacklist, courses, examinations, question_bank, choices, exam_questions, attempts, answers' AS tables;
