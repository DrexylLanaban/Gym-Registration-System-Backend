-- Legacy: add registration columns if missing. For member_id, profile_photo, payments, workouts, dashboard view, run:
-- sql/migration_gym_dashboard_v2.sql

ALTER TABLE users
  MODIFY COLUMN username VARCHAR(255) NOT NULL,
  ADD COLUMN name VARCHAR(100) NULL AFTER email,
  ADD COLUMN phone VARCHAR(20) NULL,
  ADD COLUMN role VARCHAR(20) NULL DEFAULT 'staff';
