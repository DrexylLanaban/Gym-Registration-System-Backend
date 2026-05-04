-- Apply on an existing gym_db (local or InfinityFree phpMyAdmin). Select the database first.
-- If a statement fails with "Duplicate column", skip that line — it was already applied.

-- 1) Users: link to members + profile photo (MEDIUMTEXT holds URL or base64; keep images small in the app)
ALTER TABLE users
  ADD COLUMN member_id INT NULL AFTER id,
  ADD COLUMN profile_photo MEDIUMTEXT NULL AFTER role;

ALTER TABLE users
  ADD CONSTRAINT fk_user_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;

-- 2) Memberships: status + price (PHP amounts in app; DB stores DECIMAL)
ALTER TABLE memberships
  ADD COLUMN status ENUM('active', 'expired', 'pending') DEFAULT 'active',
  ADD COLUMN price DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

-- 3) Payments: status + description; enforce DECIMAL money, NOT NULL amount
UPDATE payments SET amount = 0.00 WHERE amount IS NULL;
ALTER TABLE payments
  ADD COLUMN status ENUM('paid', 'pending', 'failed') DEFAULT 'paid',
  ADD COLUMN description VARCHAR(255) NULL;
ALTER TABLE payments
  MODIFY COLUMN amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

-- 4) Workout schedules (member dashboard / WorkoutScheduleActivity)
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

-- 5) Dashboard view (total income / active members / pending payments)
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
