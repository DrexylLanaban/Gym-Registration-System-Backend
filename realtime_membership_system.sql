-- =====================================================
-- REAL-TIME MEMBERSHIP SYSTEM WITH AUTOMATIC EXPIRATION
-- =====================================================
-- This script implements all requirements for real-time membership management

-- =====================================================
-- 1. UPDATE MEMBERS TABLE FOR PROPER STATUS HANDLING
-- =====================================================
-- Ensure all members without membership plans are inactive
UPDATE members m
SET m.status = 'inactive'
WHERE m.membership_plan_id IS NULL;

-- Update admin users to permanent status
UPDATE members m
JOIN users u ON u.member_id = m.id
SET m.status = 'permanent'
WHERE u.user_type = 'admin';

-- =====================================================
-- 2. CREATE MEMBERSHIP STATUS TRIGGERS
-- =====================================================
DELIMITER //

-- Trigger to automatically update expired memberships
CREATE TRIGGER IF NOT EXISTS check_membership_expiration
BEFORE INSERT ON attendance
FOR EACH ROW
BEGIN
    -- Update expired memberships
    UPDATE memberships 
    SET status = 'expired' 
    WHERE expiration_date <= NOW() AND status = 'active';
    
    -- Update member status to expired
    UPDATE members m
    JOIN users u ON u.member_id = m.id
    JOIN memberships ms ON u.id = ms.user_id
    SET m.status = 'expired'
    WHERE ms.expiration_date <= NOW() AND ms.status = 'expired';
END//

-- Trigger to update dashboard summary on status changes
CREATE TRIGGER IF NOT EXISTS update_dashboard_on_membership_change
AFTER UPDATE ON members
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        CALL UpdateDashboardSummary();
    END IF;
END//

DELIMITER ;

-- =====================================================
-- 3. STORED PROCEDURES FOR REAL-TIME UPDATES
-- =====================================================
DELIMITER //

-- Enhanced membership activation from payment
CREATE PROCEDURE ActivateMembership(
    IN p_member_id INT,
    IN p_plan_id INT,
    IN p_amount DECIMAL(10,2),
    IN p_payment_method VARCHAR(50),
    IN p_processed_by VARCHAR(100),
    IN p_duration_minutes INT DEFAULT NULL -- For testing: allow custom duration
)
BEGIN
    DECLARE v_plan_name VARCHAR(100);
    DECLARE v_duration_months INT;
    DECLARE v_start_date DATETIME;
    DECLARE v_expiration_date DATETIME;
    DECLARE v_member_name VARCHAR(255);
    DECLARE v_member_code VARCHAR(50);
    DECLARE v_user_id INT;
    
    -- Get plan details
    SELECT plan_name, duration_months INTO v_plan_name, v_duration_months
    FROM membership_plans WHERE id = p_plan_id;
    
    -- Get member details
    SELECT full_name, member_code, u.id INTO v_member_name, v_member_code, v_user_id
    FROM members m
    JOIN users u ON u.member_id = m.id
    WHERE m.id = p_member_id;
    
    -- Set dates (support testing with custom duration)
    SET v_start_date = NOW();
    
    IF p_duration_minutes IS NOT NULL AND p_duration_minutes > 0 THEN
        -- For testing: use custom duration in minutes
        SET v_expiration_date = DATE_ADD(v_start_date, INTERVAL p_duration_minutes MINUTE);
    ELSE
        -- Normal: use plan duration in months
        SET v_expiration_date = DATE_ADD(v_start_date, INTERVAL v_duration_months MONTH);
    END IF;
    
    -- Create payment record
    INSERT INTO payments (
        receipt_number, member_id, member_name, member_code, plan_id, plan_name, 
        amount, payment_method, status, balance, processed_by, payment_date
    ) VALUES (
        CONCAT('RCP', DATE_FORMAT(NOW(), '%Y%m%d'), LPAD(p_member_id, 4, '0')),
        p_member_id, v_member_name, v_member_code, p_plan_id, v_plan_name, 
        p_amount, p_payment_method, 'paid', 0.00, p_processed_by, NOW()
    );
    
    -- Update member with plan and active status
    UPDATE members 
    SET membership_plan_id = p_plan_id, 
        status = 'active'
    WHERE id = p_member_id;
    
    -- Create/update membership record with real-time tracking
    INSERT INTO memberships (user_id, membership_plan, start_date, expiration_date, status)
    VALUES (v_user_id, v_plan_name, v_start_date, v_expiration_date, 'active')
    ON DUPLICATE KEY UPDATE
        status = 'active',
        expiration_date = v_expiration_date;
    
    -- Update dashboard
    CALL UpdateDashboardSummary();
    
    SELECT 
        'Membership Activated' as action,
        v_member_name as member_name,
        v_plan_name as plan_name,
        v_start_date as start_date,
        v_expiration_date as expiration_date,
        TIMESTAMPDIFF(MINUTE, NOW(), v_expiration_date) as remaining_minutes;
END//

-- Get real-time membership status
CREATE PROCEDURE GetRealTimeMembershipStatus(
    IN p_member_id INT
)
BEGIN
    SELECT 
        m.id,
        m.full_name,
        m.member_code,
        m.status as current_status,
        CASE 
            WHEN u.user_type = 'admin' THEN 'PERMANENT'
            WHEN ms.expiration_date > NOW() THEN 
                CONCAT('ACTIVE - ', TIMESTAMPDIFF(MINUTE, NOW(), ms.expiration_date), ' minutes remaining')
            WHEN ms.expiration_date <= NOW() THEN 'EXPIRED'
            ELSE 'INACTIVE - NO PLAN'
        END as display_status,
        mp.plan_name as current_plan,
        mp.price as plan_price,
        ms.start_date,
        ms.expiration_date,
        CASE 
            WHEN ms.expiration_date > NOW() THEN TIMESTAMPDIFF(MINUTE, NOW(), ms.expiration_date)
            ELSE 0
        END as remaining_minutes,
        CASE 
            WHEN ms.expiration_date > NOW() THEN TIMESTAMPDIFF(SECOND, NOW(), ms.expiration_date)
            ELSE 0
        END as remaining_seconds,
        u.user_type,
        CASE 
            WHEN ms.expiration_date > NOW() THEN 'active'
            WHEN ms.expiration_date <= NOW() THEN 'expired'
            ELSE 'inactive'
        END as membership_status
    FROM members m
    JOIN users u ON u.member_id = m.id
    LEFT JOIN membership_plans mp ON m.membership_plan_id = mp.id
    LEFT JOIN memberships ms ON u.id = ms.user_id AND ms.status = 'active'
    WHERE m.id = p_member_id;
END//

-- Check for expired memberships and update them
CREATE PROCEDURE ProcessExpiredMemberships()
BEGIN
    -- Update expired memberships
    UPDATE memberships 
    SET status = 'expired' 
    WHERE expiration_date <= NOW() AND status = 'active';
    
    -- Update corresponding member status
    UPDATE members m
    JOIN users u ON u.member_id = m.id
    JOIN memberships ms ON u.id = ms.user_id
    SET m.status = 'expired'
    WHERE ms.expiration_date <= NOW() AND ms.status = 'expired';
    
    -- Update dashboard
    CALL UpdateDashboardSummary();
    
    SELECT COUNT(*) as expired_count
    FROM memberships 
    WHERE expiration_date <= NOW() AND status = 'expired';
END//

DELIMITER ;

-- =====================================================
-- 4. CREATE REAL-TIME API ENDPOINTS
-- =====================================================
-- These will be added to gym.js:
-- GET /api/membership-status/:id - Get real-time membership status
-- POST /api/memberships/activate - Activate membership with custom duration
-- GET /api/membership-timer/:id - Get countdown timer
-- POST /api/test-membership - Create 2-minute test membership

-- =====================================================
-- 5. TESTING DATA SETUP
-- =====================================================
-- Insert a 2-minute test plan for testing
INSERT INTO membership_plans (plan_name, plan_type, duration_months, price, description, features, is_active)
VALUES ('Test 2-Minute', 'monthly', 0, 50.00, '2-minute test membership for automatic expiration testing', 'Full gym access for 2 minutes, automatic expiration test')
ON DUPLICATE KEY UPDATE
    plan_name = VALUES(plan_name),
    plan_type = VALUES(plan_type),
    duration_months = VALUES(duration_months),
    price = VALUES(price),
    description = VALUES(description),
    features = VALUES(features);

-- =====================================================
-- 6. RUN INITIAL SETUP
-- =====================================================
-- Process any expired memberships
CALL ProcessExpiredMemberships();

-- Update dashboard summary
CALL UpdateDashboardSummary();

-- =====================================================
-- END OF REAL-TIME MEMBERSHIP SYSTEM
-- =====================================================
