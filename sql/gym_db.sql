CREATE DATABASE IF NOT EXISTS gym_db;
USE gym_db;

-- Members first (referenced by users, memberships, attendance, payments, workout_schedules)
CREATE TABLE IF NOT EXISTS members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    profile_image TEXT,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trainers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    specialization VARCHAR(100),
    phone VARCHAR(20)
);

-- Login accounts; member_id links app user to gym member row (mobile registration creates both)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    name VARCHAR(100),
    phone VARCHAR(20),
    role VARCHAR(20) DEFAULT 'staff',
    profile_photo MEDIUMTEXT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS memberships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT,
    type VARCHAR(50),
    start_date DATE,
    end_date DATE,
    status ENUM('active', 'expired', 'pending') DEFAULT 'active',
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT,
    check_in TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id)
);

-- Money: DECIMAL(10,2). status supports dashboard pending vs paid (PHP ₱ in UI only)
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    payment_date DATE,
    method VARCHAR(50),
    status ENUM('paid', 'pending', 'failed') DEFAULT 'paid',
    description VARCHAR(255) NULL,
    FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS workout_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    trainer_id INT NULL,
    day_of_week ENUM(
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday'
    ),
    exercise_name VARCHAR(255) NOT NULL,
    sets INT DEFAULT 0,
    reps INT DEFAULT 0,
    weight VARCHAR(50),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
);

CREATE OR REPLACE VIEW dashboard_summary AS
SELECT
    (SELECT COUNT(*) FROM members) AS total_members,
    (SELECT COUNT(*) FROM members WHERE status = 'active') AS active_members,
    (SELECT COUNT(*) FROM attendance WHERE DATE(check_in) = CURDATE()) AS today_attendance,
    (
        SELECT COALESCE(SUM(amount), 0)
        FROM payments
        WHERE status = 'paid'
          AND MONTH(payment_date) = MONTH(CURDATE())
          AND YEAR(payment_date) = YEAR(CURDATE())
    ) AS monthly_income,
    (SELECT COUNT(*) FROM trainers) AS total_trainers,
    (SELECT COUNT(*) FROM payments WHERE status = 'pending') AS pending_payments;
