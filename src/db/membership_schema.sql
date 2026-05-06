-- =====================================================
-- MEMBERSHIP SYSTEM DATABASE SCHEMA
-- Run this in MySQL to set up the membership tables
-- =====================================================

-- 1. CREATE MEMBERSHIPS TABLE (if not exists)
CREATE TABLE IF NOT EXISTS memberships (
    membership_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    member_id INT NOT NULL,
    membership_plan VARCHAR(100) NOT NULL,
    amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    start_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiration_date DATETIME NOT NULL,
    remaining_seconds INT DEFAULT 0,
    membership_status ENUM('active', 'expired', 'inactive', 'pending') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_active (user_id, membership_status),
    INDEX idx_user_id (user_id),
    INDEX idx_expiration (expiration_date),
    INDEX idx_status (membership_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. CREATE NOTIFICATIONS TABLE (if not exists)
CREATE TABLE IF NOT EXISTS notifications (
    notification_id INT PRIMARY KEY AUTO_INCREMENT,
    admin_target ENUM('all', 'single') DEFAULT 'all',
    user_id INT DEFAULT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'payment',
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. ADD MISSING COLUMNS TO EXISTING TABLES
ALTER TABLE members 
    ADD COLUMN IF NOT EXISTS membership_plan_id INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS membership_end DATE DEFAULT NULL,
    ADD INDEX idx_membership_status (membership_plan_id);

-- 4. INSERT MEMBERSHIP PLANS (Trial, Monthly, Annual)
INSERT INTO membership_plans (id, plan_name, plan_type, duration_months, price, description, features, is_active)
VALUES 
(1, 'Trial Access', 'trial', 0, 1.00, '2-minute trial access for testing', 'Full gym access for 2 minutes, Testing expiration system', 1),
(2, 'Standard Monthly', 'monthly', 1, 500.00, '30 days full access', 'Unlimited gym access, Locker room, Free WiFi', 1),
(3, 'Elite Annual', 'annual', 12, 4500.00, '365 days premium access', 'Unlimited gym access, Personal locker, Free WiFi, Priority booking, Personal trainer consultation', 1)
ON DUPLICATE KEY UPDATE 
    plan_name = VALUES(plan_name),
    price = VALUES(price),
    duration_months = VALUES(duration_months),
    description = VALUES(description),
    features = VALUES(features),
    is_active = 1;

-- 5. CREATE EXPIRATION CHECKER EVENT (if event scheduler enabled)
DELIMITER //
CREATE EVENT IF NOT EXISTS check_expired_memberships
ON SCHEDULE EVERY 1 MINUTE
DO
BEGIN
    UPDATE memberships 
    SET membership_status = 'expired', remaining_seconds = 0
    WHERE expiration_date <= NOW() AND membership_status = 'active';
    
    UPDATE members m
    JOIN memberships ms ON m.id = ms.member_id
    SET m.status = 'expired'
    WHERE ms.membership_status = 'expired' AND m.status = 'active';
END//
DELIMITER ;

-- 6. SET EVENT SCHEDULER ON (requires appropriate MySQL privileges)
SET GLOBAL event_scheduler = ON;

-- Done
SELECT 'Membership system schema setup complete' AS status;
