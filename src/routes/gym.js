const express = require("express");
const multer = require("multer");
const { db } = require("../services/db");
const { handleAuthLogin, handleAuthRegister } = require("./auth");

const gymApiRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function normalizeTrainerRow(row) {
  const fullName = row.full_name != null ? String(row.full_name).trim() : "";
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts.length > 0 ? parts[0] : "";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  
  // Base64 placeholder image for all trainers to ensure Android compatibility
  const placeholderImage = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8A";
  
  // Always use base64 placeholder to ensure Android compatibility
  let profilePhoto = placeholderImage;
  
  return {
    id: row.id,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    phone: row.phone || "",
    email: row.email || "",
    specialization: row.specialization || "",
    description: row.description != null ? String(row.description) : "",
    status: row.status != null ? String(row.status) : "active",
    member_count: row.member_count != null ? Number(row.member_count) : 0,
    profile_photo: profilePhoto,
    image_url: profilePhoto,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/** POST /api/login — ApiService: api/login (email or username + password, ApiResponse shape) */
gymApiRouter.post("/login", handleAuthLogin);

/** POST /api/register — ApiService: api/register */
gymApiRouter.post("/register", handleAuthRegister);

/** GET /api/membership-plans — Get all membership plans */
gymApiRouter.get("/membership-plans", (req, res) => {
  try {
    // Return plans matching your XML payment popup design
    const plans = [
      {
        id: 1,
        planName: "TRIAL AWAKENING",
        planType: "trial",
        durationMonths: 0,
        durationMinutes: 2, // 2 minutes for testing
        price: 1.00,
        description: "2 Minutes of Power",
        features: "Trial access to test membership system",
        isActive: true,
        formattedPrice: "₱1.00",
        duration: "2 Minutes"
      },
      {
        id: 2,
        planName: "STANDARD MONTHLY",
        planType: "monthly",
        durationMonths: 1,
        durationMinutes: 43200, // 30 days in minutes
        price: 500.00,
        description: "Full monthly access",
        features: "Gym access, locker, shower",
        isActive: true,
        formattedPrice: "₱500.00",
        duration: "30 Days"
      },
      {
        id: 3,
        planName: "ELITE ANNUAL",
        planType: "annual",
        durationMonths: 12,
        durationMinutes: 525600, // 365 days in minutes
        price: 4500.00,
        description: "Best value annual plan",
        features: "All amenities + personal trainer session",
        isActive: true,
        formattedPrice: "₱4,500.00",
        duration: "365 Days"
      }
    ];
    
    return res.json({
      success: true,
      data: plans,
      count: plans.length,
      message: "Membership plans retrieved successfully"
    });
  } catch (err) {
    console.error('Membership plans error:', err);
    return res.status(500).json({ success: false, message: "Failed to fetch membership plans" });
  }
});

/** GET /api/membership-status/:id — Get real-time membership status */
gymApiRouter.get("/membership-status/:id", async (req, res, next) => {
  try {
    const memberId = Number(req.params.id);
    if (!Number.isFinite(memberId)) {
      return res.status(400).json({ success: false, message: "Valid member ID required" });
    }

    // Use direct SQL query for real-time status with balance included
    const [results] = await db.query(
      `SELECT m.*, 
              CASE 
                WHEN m.current_status = 'active' AND m.expiration_date > NOW() 
                THEN TIMESTAMPDIFF(MINUTE, NOW(), m.expiration_date)
                ELSE 0 
              END as remaining_minutes,
              CASE 
                WHEN m.expiration_date IS NOT NULL 
                THEN m.expiration_date 
                ELSE NULL 
              END as expiration_date
       FROM members m 
       WHERE m.id = ?`,
      [memberId]
    );
    
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const member = results[0];
    
    return res.json({
      success: true,
      data: {
        id: member.id,
        full_name: member.full_name,
        member_code: member.member_code,
        current_status: member.current_status,
        display_status: member.display_status,
        current_plan: member.current_plan,
        plan_price: member.plan_price ? Number(member.plan_price) : 0,
        start_date: member.start_date,
        expiration_date: member.expiration_date,
        remaining_minutes: member.remaining_minutes || 0,
        remaining_seconds: member.remaining_seconds || 0,
        user_type: member.user_type,
        membership_status: member.membership_status,
        balance: member.balance || 0.00
      },
      message: "Membership status retrieved successfully"
    });
  } catch (err) {
    console.error('Membership status error:', err);
    return next(err);
  }
});

/** POST /api/memberships/activate — Activate membership with custom duration */
gymApiRouter.post("/memberships/activate", async (req, res, next) => {
  try {
    const { member_id, user_id, plan_id, amount, payment_method, duration_minutes } = req.body || {};
    
    console.log('Membership activation request body:', req.body);
    
    // Accept either member_id or user_id
    let actualMemberId = member_id;
    if (!actualMemberId && user_id) {
      // Look up member_id from user_id
      console.log('Looking up member_id for user_id:', user_id);
      const [userRows] = await db.query("SELECT member_id FROM users WHERE id = ?", [user_id]);
      console.log('User rows found:', userRows.length);
      if (userRows.length > 0 && userRows[0].member_id) {
        actualMemberId = userRows[0].member_id;
        console.log('Found member_id:', actualMemberId);
      } else {
        console.log('No member_id found for user_id:', user_id);
        return res.status(400).json({ success: false, message: "User not linked to a member account" });
      }
    }
    
    if (!actualMemberId || !plan_id || !amount) {
      return res.status(400).json({ success: false, message: "member_id, plan_id, and amount are required" });
    }

    // Use direct SQL queries instead of stored procedure
    const finalDuration = duration_minutes || 43200;
    console.log('Final duration:', finalDuration, 'Type:', typeof finalDuration);
    
    // Start transaction
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      
      // Check balance if payment_method is 'balance'
      if (payment_method === 'balance') {
        const [rows] = await conn.query("SELECT balance FROM members WHERE id = ?", [actualMemberId]);
        if (rows.length === 0 || rows[0].balance < amount) {
          throw new Error("Insufficient balance. You need " + amount + " PHP.");
        }
        // Deduct balance
        await conn.query("UPDATE members SET balance = balance - ? WHERE id = ?", [amount, actualMemberId]);
      }

      // Create payment record without plan_id column
      const [paymentResult] = await conn.query(
        "INSERT INTO payments (member_id, amount, payment_method, processed_by, status) VALUES (?, ?, ?, ?, ?)",
        [actualMemberId, amount, payment_method || 'system', 'system', 'confirmed']
      );
      
      // Update member membership
      const startDate = new Date();
      const expirationDate = new Date(startDate.getTime() + finalDuration * 60 * 1000);
      
      // Get plan name from static data
      let planName = 'Unknown Plan';
      if (plan_id === 1) planName = 'TRIAL AWAKENING';
      else if (plan_id === 2) planName = 'STANDARD MONTHLY';
      else if (plan_id === 3) planName = 'ELITE ANNUAL';
      
      await conn.query(
        "UPDATE members SET current_status = 'active', start_date = ?, expiration_date = ?, current_plan = ? WHERE id = ?",
        [startDate, expirationDate, planName, actualMemberId]
      );
      
      await conn.commit();
      
      const results = [{
        action: 'activated',
        member_name: 'Member',
        plan_name: 'Plan',
        start_date: startDate,
        expiration_date: expirationDate,
        remaining_minutes: finalDuration
      }];
      
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    
    if (results.length === 0) {
      return res.status(400).json({ success: false, message: "Membership activation failed" });
    }

    const result = results[0];
    
    return res.json({
      success: true,
      data: {
        action: result.action,
        member_name: result.member_name,
        plan_name: result.plan_name,
        start_date: result.start_date,
        expiration_date: result.expiration_date,
        remaining_minutes: result.remaining_minutes
      },
      message: "Membership activated successfully"
    });
  } catch (err) {
    console.error('Membership activation error:', err);
    return next(err);
  }
});

/** GET /api/membership-timer/:id — Get countdown timer */
gymApiRouter.get("/membership-timer/:id", async (req, res, next) => {
  try {
    const memberId = Number(req.params.id);
    if (!Number.isFinite(memberId)) {
      return res.status(400).json({ success: false, message: "Valid member ID required" });
    }

    const [membership] = await db.query(
      `SELECT * FROM members WHERE id = ? AND current_status = 'active'`,
      [memberId]
    );

    if (membership.length === 0) {
      return res.json({
        success: true,
        data: {
          remaining_seconds: 0,
          remaining_minutes: 0,
          remaining_hours: 0,
          remaining_days: 0,
          status: 'inactive',
          expiration_date: null,
          is_expired: true,
          formatted_time: 'No active membership'
        }
      });
    }

    const member = membership[0];
    const now = new Date();
    const expiration = new Date(member.expiration_date);
    const isExpired = now > expiration;

    let remainingSeconds = 0;
    let remainingMinutes = 0;
    let remainingHours = 0;
    let remainingDays = 0;

    if (!isExpired) {
      remainingSeconds = Math.floor((expiration - now) / 1000);
      remainingMinutes = Math.floor(remainingSeconds / 60);
      remainingHours = Math.floor(remainingMinutes / 60);
      remainingDays = Math.floor(remainingHours / 24);
    }

    return res.json({
      success: true,
      data: {
        remaining_seconds: Math.max(0, remainingSeconds),
        remaining_minutes: Math.max(0, remainingMinutes),
        remaining_hours: Math.max(0, remainingHours),
        remaining_days: Math.max(0, remainingDays),
        status: isExpired ? 'expired' : 'active',
        expiration_date: member.expiration_date,
        is_expired: isExpired,
        formatted_time: isExpired ? 'Membership expired' : 
          `${remainingDays}d ${remainingHours % 24}h ${remainingMinutes % 60}m`
      }
    });
  } catch (err) {
    console.error('Membership timer error:', err);
    return next(err);
  }
});

/** POST /api/test-membership — Create 2-minute test membership */
gymApiRouter.post("/test-membership", async (req, res, next) => {
  try {
    const { member_id } = req.body || {};
    
    if (!member_id) {
      return res.status(400).json({ success: false, message: "member_id is required" });
    }

    // Use static test plan data since table doesn't exist
    const plan = {
      id: 0,
      plan_name: 'Test 2-Minute',
      price: 1.00
    };

    // Activate 2-minute membership using direct SQL
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      
      // Create payment record without plan_id
      await conn.query(
        "INSERT INTO payments (member_id, amount, payment_method, processed_by, status) VALUES (?, ?, ?, ?, ?)",
        [member_id, plan.price, 'system', 'system', 'confirmed']
      );
      
      // Update member membership (2 minutes = 120 seconds)
      const startDate = new Date();
      const expirationDate = new Date(startDate.getTime() + 2 * 60 * 1000);
      
      await conn.query(
        "UPDATE members SET current_status = 'active', start_date = ?, expiration_date = ?, current_plan = ? WHERE id = ?",
        [startDate, expirationDate, plan.plan_name, member_id]
      );
      
      await conn.commit();
      
      const results = [{
        action: 'activated',
        member_name: 'Test Member',
        plan_name: plan.plan_name,
        start_date: startDate,
        expiration_date: expirationDate,
        remaining_minutes: 2
      }];
      
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    
    if (results.length === 0) {
      return res.status(400).json({ success: false, message: "Test membership activation failed" });
    }

    const result = results[0];
    
    return res.json({
      success: true,
      data: {
        action: result.action,
        member_name: result.member_name,
        plan_name: result.plan_name,
        start_date: result.start_date,
        expiration_date: result.expiration_date,
        remaining_minutes: result.remaining_minutes,
        test_mode: true,
        message: "Test membership activated for 2 minutes"
      },
      message: "Test membership created successfully"
    });
  } catch (err) {
    console.error('Test membership error:', err);
    return next(err);
  }
});

/** POST /api/process-expirations — Process expired memberships manually */
gymApiRouter.post("/process-expirations", async (req, res, next) => {
  try {
    // Update expired memberships
    const [result] = await db.query(
      "UPDATE members SET current_status = 'expired' WHERE expiration_date < NOW() AND current_status = 'active'"
    );
    
    return res.json({
      success: true,
      data: {
        processed_count: result.affectedRows || 0,
        message: "Expired memberships processed successfully"
      },
      message: "Expiration processing completed"
    });
  } catch (err) {
    console.error('Process expirations error:', err);
    return next(err);
  }
});

/** POST /api/payments — Process payment */
gymApiRouter.post("/payments", async (req, res, next) => {
  try {
    const { member_id, plan_id, amount, payment_method, notes, processed_by } = req.body || {};
    
    if (!member_id || !plan_id || !amount) {
      return res.status(400).json({ success: false, message: "member_id, plan_id, and amount are required" });
    }

    // Get member details
    const [memberRows] = await db.query("SELECT * FROM members WHERE id = ?", [member_id]);
    
    if (memberRows.length === 0) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const member = memberRows[0];
    
    // Create payment record without plan_id column
    const [paymentResult] = await db.query(
      `INSERT INTO payments (member_id, amount, payment_method, notes, processed_by, status) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [member_id, amount, payment_method || 'cash', notes || '', processed_by || 'admin', 'confirmed']
    );

    const paymentId = paymentResult.insertId;
    const receiptNumber = `RCP${String(paymentId).padStart(6, '0')}`;
    
    // Update payment with receipt number
    await db.query("UPDATE payments SET receipt_number = ? WHERE id = ?", [receiptNumber, paymentId]);

    // Get plan name from static data
    let planName = 'Unknown Plan';
    if (plan_id === 1) planName = 'TRIAL AWAKENING';
    else if (plan_id === 2) planName = 'STANDARD MONTHLY';
    else if (plan_id === 3) planName = 'ELITE ANNUAL';
    
    return res.json({
      success: true,
      data: {
        id: paymentId,
        member_id: member_id,
        member_name: member.full_name,
        plan_name: planName,
        amount: Number(amount),
        payment_method: payment_method || 'cash',
        notes: notes || '',
        processed_by: processed_by || 'admin',
        receipt_number: receiptNumber,
        status: 'confirmed',
        created_at: new Date(),
        formatted_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        formatted_amount: `₱${Number(amount).toFixed(2)}`
      },
      message: "Payment processed successfully"
    });
  } catch (err) {
    console.error('Payment processing error:', err);
    return next(err);
  }
});

/** GET /api/payments — Get all payments with optional filters */
gymApiRouter.get("/payments", async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search, status, date_from, date_to } = req.query;
    
    let whereClause = "WHERE 1=1";
    const params = [];
    
    if (search) {
      whereClause += " AND (m.full_name LIKE ? OR p.receipt_number LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (status) {
      whereClause += " AND p.status = ?";
      params.push(status);
    }
    
    if (date_from) {
      whereClause += " AND p.created_at >= ?";
      params.push(date_from);
    }
    
    if (date_to) {
      whereClause += " AND p.created_at <= ?";
      params.push(date_to);
    }
    
    const offset = (page - 1) * limit;
    
    const [payments] = await db.query(
      `SELECT p.*, m.full_name as member_name, mp.plan_name 
       FROM payments p
       LEFT JOIN members m ON p.member_id = m.id
       LEFT JOIN membership_plans mp ON p.plan_id = mp.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total 
       FROM payments p
       LEFT JOIN members m ON p.member_id = m.id
       ${whereClause}`,
      params
    );
    
    return res.json({
      success: true,
      data: payments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: countResult[0].total,
        pages: Math.ceil(countResult[0].total / limit)
      },
      message: "Payments retrieved successfully"
    });
  } catch (err) {
    console.error('Get payments error:', err);
    return next(err);
  }
});

/** GET /api/my-payments — Get user-specific payments */
gymApiRouter.get("/my-payments", async (req, res, next) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ success: false, message: "user_id is required" });
    }

    // Get member_id from user_id
    const [userRows] = await db.query("SELECT member_id FROM users WHERE id = ?", [user_id]);
    if (userRows.length === 0 || !userRows[0].member_id) {
      return res.status(404).json({ success: false, message: "User not found or not linked to a member" });
    }
    
    const memberId = userRows[0].member_id;
    
    const [payments] = await db.query(
      `SELECT p.*, '' as plan_name 
       FROM payments p
       WHERE p.member_id = ?
       ORDER BY p.created_at DESC`,
      [memberId]
    );
    
    return res.json({
      success: true,
      data: payments,
      count: payments.length,
      message: "User payments retrieved successfully"
    });
  } catch (err) {
    console.error('Get user payments error:', err);
    return next(err);
  }
});

/** GET /api/admin/notifications - Get all admin notifications */
gymApiRouter.get("/admin/notifications", async (req, res) => {
  try {
    const [notifications] = await db.query(
      `SELECT n.*, u.name as user_name 
       FROM notifications n
       LEFT JOIN users u ON n.user_id = u.id
       WHERE admin_target = 'all'
       ORDER BY n.created_at DESC
       LIMIT 50`
    );
    
    return res.json({
      success: true,
      data: notifications,
      count: notifications.length
    });
  } catch (err) {
    console.error('Admin notifications error:', err);
    return res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
});

module.exports = { gymApiRouter };
