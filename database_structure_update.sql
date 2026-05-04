-- =====================================================
-- COMPLETE DATABASE STRUCTURE UPDATE FOR GYM SYSTEM
-- =====================================================
-- This script creates proper tables for membership plans, payments, attendance, and workout schedules

-- =====================================================
-- 1. MEMBERSHIP PLANS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS membership_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plan_name VARCHAR(100) NOT NULL,
    plan_type ENUM('monthly', 'quarterly', 'yearly') NOT NULL,
    duration_months INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    description TEXT NULL,
    features TEXT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_membership_plans_active (is_active),
    INDEX idx_membership_plans_type (plan_type)
);

-- Insert default membership plans
INSERT INTO membership_plans (plan_name, plan_type, duration_months, price, description, features) VALUES
('Basic Monthly', 'monthly', 1, 999.00, 'Access to gym equipment and basic facilities', 'Basic gym access, locker room, shower facilities'),
('Premium Monthly', 'monthly', 1, 1499.00, 'Full gym access with group classes', 'All gym access, group classes, locker room, shower, personal trainer discount'),
('Basic Quarterly', 'quarterly', 3, 2499.00, '3-month basic membership', 'Basic gym access for 3 months, save ₱498'),
('Premium Quarterly', 'quarterly', 3, 3999.00, '3-month premium membership', 'All gym access for 3 months, group classes, save ₱498'),
('Basic Yearly', 'yearly', 12, 8999.00, '1-year basic membership', 'Basic gym access for 1 year, save ₱2989'),
('Premium Yearly', 'yearly', 12, 14999.00, '1-year premium membership', 'All premium features for 1 year, save ₱2989')
ON DUPLICATE KEY UPDATE
    plan_name = VALUES(plan_name),
    plan_type = VALUES(plan_type),
    duration_months = VALUES(duration_months),
    price = VALUES(price),
    description = VALUES(description),
    features = VALUES(features);

-- =====================================================
-- 2. UPDATE PAYMENTS TABLE TO MATCH PAYMENT MODEL
-- =====================================================
-- Drop and recreate payments table with proper structure
DROP TABLE IF EXISTS payments;

CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    receipt_number VARCHAR(50) UNIQUE NULL,
    member_id INT NOT NULL,
    member_name VARCHAR(255) NOT NULL,
    member_code VARCHAR(50) NULL,
    plan_id INT NULL,
    plan_name VARCHAR(100) NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method ENUM('cash', 'gcash', 'bank_transfer', 'card') DEFAULT 'cash',
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT NULL,
    processed_by VARCHAR(100) NULL,
    status ENUM('paid', 'partial', 'unpaid') DEFAULT 'unpaid',
    balance DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES membership_plans(id) ON DELETE SET NULL,
    INDEX idx_payments_member_id (member_id),
    INDEX idx_payments_plan_id (plan_id),
    INDEX idx_payments_status (status),
    INDEX idx_payments_date (payment_date),
    INDEX idx_payments_receipt (receipt_number)
);

-- =====================================================
-- 3. UPDATE ATTENDANCE TABLE TO MATCH ATTENDANCE MODEL
-- =====================================================
-- Drop and recreate attendance table with proper structure
DROP TABLE IF EXISTS attendance;

CREATE TABLE attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    member_name VARCHAR(255) NOT NULL,
    member_code VARCHAR(50) NULL,
    profile_photo MEDIUMTEXT NULL,
    check_in TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_out TIMESTAMP NULL,
    date DATE GENERATED ALWAYS AS (DATE(check_in)) VIRTUAL,
    duration_minutes INT GENERATED ALWAYS AS (
        CASE 
            WHEN check_out IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, check_in, check_out)
            ELSE NULL
        END
    ) VIRTUAL,
    status ENUM('checked_in', 'checked_out') DEFAULT 'checked_in',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    INDEX idx_attendance_member_id (member_id),
    INDEX idx_attendance_date (date),
    INDEX idx_attendance_status (status)
);

-- =====================================================
-- 4. UPDATE WORKOUT_SCHEDULES TABLE TO MATCH WORKOUTSCHEDULE MODEL
-- =====================================================
-- Drop and recreate workout_schedules table with proper structure
DROP TABLE IF EXISTS workout_schedules;

CREATE TABLE workout_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    workout_name VARCHAR(255) NOT NULL,
    workout_time VARCHAR(100) NOT NULL,
    status ENUM('pending', 'completed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_workout_schedules_user_id (user_id),
    INDEX idx_workout_schedules_status (status)
);

-- =====================================================
-- 5. UPDATE MEMBERS TABLE FOR PROPER STATUS HANDLING
-- =====================================================
ALTER TABLE members 
ADD COLUMN IF NOT EXISTS member_code VARCHAR(50) UNIQUE AFTER id,
ADD COLUMN IF NOT EXISTS membership_plan_id INT NULL AFTER member_code,
ADD INDEX IF NOT EXISTS idx_members_member_code (member_code),
ADD INDEX IF NOT EXISTS idx_members_plan_id (membership_plan_id),
ADD FOREIGN KEY IF NOT EXISTS (membership_plan_id) REFERENCES membership_plans(id) ON DELETE SET NULL;

-- Generate unique member codes for existing members
UPDATE members SET member_code = CONCAT('MEM', LPAD(id, 6, '0')) WHERE member_code IS NULL;

-- =====================================================
-- 6. UPDATE USERS TABLE FOR PROPER ROLE HANDLING
-- =====================================================
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS user_type ENUM('member', 'admin', 'staff') DEFAULT 'member' AFTER role,
ADD INDEX IF NOT EXISTS idx_users_user_type (user_type);

-- Update existing users
UPDATE users SET user_type = 'admin' WHERE role = 'admin';
UPDATE users SET user_type = 'member' WHERE role = 'member';

-- =====================================================
-- 7. CREATE STORED PROCEDURES FOR AUTOMATIC UPDATES
-- =====================================================
DELIMITER //

-- Procedure to create membership from payment
CREATE PROCEDURE CreateMembershipFromPayment(
    IN p_member_id INT,
    IN p_plan_id INT,
    IN p_amount DECIMAL(10,2),
    IN p_payment_method VARCHAR(50),
    IN p_processed_by VARCHAR(100)
)
BEGIN
    DECLARE v_plan_name VARCHAR(100);
    DECLARE v_duration_months INT;
    DECLARE v_start_date DATE;
    DECLARE v_expiration_date DATE;
    DECLARE v_member_name VARCHAR(255);
    
    -- Get plan details
    SELECT plan_name, duration_months INTO v_plan_name, v_duration_months
    FROM membership_plans WHERE id = p_plan_id;
    
    -- Get member name
    SELECT full_name INTO v_member_name FROM members WHERE id = p_member_id;
    
    -- Set dates
    SET v_start_date = CURDATE();
    SET v_expiration_date = DATE_ADD(v_start_date, INTERVAL v_duration_months MONTH);
    
    -- Create payment record
    INSERT INTO payments (
        receipt_number, member_id, member_name, member_code, plan_id, plan_name, 
        amount, payment_method, status, balance, processed_by
    ) VALUES (
        CONCAT('RCP', DATE_FORMAT(NOW(), '%Y%m%d'), LPAD(p_member_id, 4, '0')),
        p_member_id, v_member_name, (SELECT member_code FROM members WHERE id = p_member_id),
        p_plan_id, v_plan_name, p_amount, p_payment_method, 'paid', 0.00, p_processed_by
    );
    
    -- Update member with plan
    UPDATE members 
    SET membership_plan_id = p_plan_id,
        status = 'active'
    WHERE id = p_member_id;
    
    -- Create membership record
    INSERT INTO memberships (user_id, membership_plan, start_date, expiration_date, status)
    SELECT u.id, v_plan_name, v_start_date, v_expiration_date, 'active'
    FROM users u WHERE u.member_id = p_member_id;
END//

-- Procedure to check in member
CREATE PROCEDURE CheckInMember(
    IN p_member_id INT
)
BEGIN
    DECLARE v_member_name VARCHAR(255);
    DECLARE v_member_code VARCHAR(50);
    DECLARE v_profile_photo MEDIUMTEXT;
    
    -- Get member details
    SELECT full_name, member_code, profile_photo 
    INTO v_member_name, v_member_code, v_profile_photo
    FROM members WHERE id = p_member_id;
    
    -- Create attendance record
    INSERT INTO attendance (member_id, member_name, member_code, profile_photo, status)
    VALUES (p_member_id, v_member_name, v_member_code, v_profile_photo, 'checked_in');
END//

-- Procedure to check out member
CREATE PROCEDURE CheckOutMember(
    IN p_member_id INT
)
BEGIN
    UPDATE attendance 
    SET check_out = NOW(), status = 'checked_out'
    WHERE member_id = p_member_id AND status = 'checked_in'
    ORDER BY check_in DESC LIMIT 1;
END//

DELIMITER ;

-- =====================================================
-- 8. CREATE API ENDPOINTS NEEDED
-- =====================================================
-- These endpoints will be created in the gym.js file:
-- GET /api/membership-plans - Get all membership plans
-- POST /api/payments - Process payment
-- POST /api/attendance/check-in - Check in member
-- POST /api/attendance/check-out - Check out member
-- GET /api/workout-schedules - Get workout schedules
-- POST /api/workout-schedules - Create workout schedule

-- =====================================================
-- 9. SAMPLE DATA FOR TESTING
-- =====================================================
-- Update existing members with proper status
UPDATE members SET 
    status = CASE 
        WHEN membership_plan_id IS NOT NULL THEN 'active'
        ELSE 'inactive'
    END;

-- Set admin users to permanent status
UPDATE members m
JOIN users u ON u.member_id = m.id
SET m.status = 'permanent'
WHERE u.user_type = 'admin';

-- =====================================================
-- END OF DATABASE STRUCTURE UPDATE
-- =====================================================
