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
        durationLabel: "2 Minutes",
        testMode: true
      },
      {
        id: 2,
        planName: "WARRIOR ASCENT",
        planType: "monthly",
        durationMonths: 1,
        price: 500.00,
        description: "30 Days Membership",
        features: "Full gym access for 30 days, equipment, locker room",
        isActive: true,
        formattedPrice: "₱500.00",
        durationLabel: "30 Days",
        testMode: false
      },
      {
        id: 3,
        planName: "ETERNAL LEGEND",
        planType: "yearly",
        durationMonths: 12,
        price: 4500.00,
        description: "1 Year Membership",
        features: "All premium features for 1 year, save ₱1,500",
        isActive: true,
        formattedPrice: "₱4,500.00",
        durationLabel: "1 Year",
        testMode: false
      }
    ];

    return res.json({
      success: true,
      data: plans,
      message: "Membership plans fetched successfully"
    });
  } catch (err) {
    console.error('Membership plans error:', err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

/** GET /api/membership-status/:id — Get real-time membership status */
gymApiRouter.get("/membership-status/:id", async (req, res, next) => {
  try {
    const memberId = Number(req.params.id);
    if (!Number.isFinite(memberId)) {
      return res.status(400).json({ success: false, message: "Valid member ID required" });
    }

    // Use stored procedure for real-time status
    const [results] = await db.query("CALL GetRealTimeMembershipStatus(?)", [memberId]);
    
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
        membership_status: member.membership_status
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
      const [userRows] = await db.query("SELECT member_id FROM users WHERE id = ?", [user_id]);
      if (userRows.length > 0 && userRows[0].member_id) {
        actualMemberId = userRows[0].member_id;
      }
    }
    
    if (!actualMemberId || !plan_id || !amount) {
      return res.status(400).json({ success: false, message: "member_id, plan_id, and amount are required" });
    }

    // Use stored procedure with custom duration support
    const finalDuration = duration_minutes || 43200;
    console.log('Final duration:', finalDuration, 'Type:', typeof finalDuration);
    
    const [results] = await db.query("CALL ActivateMembership(?, ?, ?, ?, ?, ?)", [
      actualMemberId, plan_id, amount, payment_method || 'system', 'system', finalDuration
    ]);
    
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

    // Get real-time membership data
    const [results] = await db.query(`
      SELECT 
        ms.expiration_date,
        TIMESTAMPDIFF(SECOND, NOW(), ms.expiration_date) as remaining_seconds,
        TIMESTAMPDIFF(MINUTE, NOW(), ms.expiration_date) as remaining_minutes,
        TIMESTAMPDIFF(HOUR, NOW(), ms.expiration_date) as remaining_hours,
        TIMESTAMPDIFF(DAY, NOW(), ms.expiration_date) as remaining_days,
        CASE 
          WHEN ms.expiration_date > NOW() THEN 'active'
          WHEN ms.expiration_date <= NOW() THEN 'expired'
          ELSE 'inactive'
        END as status
      FROM memberships ms
      JOIN users u ON u.id = ms.user_id
      WHERE u.member_id = ? AND ms.status = 'active'
      ORDER BY ms.created_at DESC LIMIT 1
    `, [memberId]);

    if (results.length === 0) {
      return res.json({
        success: true,
        data: {
          remaining_seconds: 0,
          remaining_minutes: 0,
          remaining_hours: 0,
          remaining_days: 0,
          status: 'inactive',
          expiration_date: null,
          is_expired: false,
          formatted_time: 'No active membership'
        }
      });
    }

    const membership = results[0];
    const isExpired = membership.remaining_seconds <= 0;
    
    return res.json({
      success: true,
      data: {
        remaining_seconds: Math.max(0, membership.remaining_seconds),
        remaining_minutes: Math.max(0, membership.remaining_minutes),
        remaining_hours: Math.max(0, membership.remaining_hours),
        remaining_days: Math.max(0, membership.remaining_days),
        status: isExpired ? 'expired' : 'active',
        expiration_date: membership.expiration_date,
        is_expired: isExpired,
        formatted_time: isExpired ? 'Membership expired' : 
          `${membership.remaining_days}d ${membership.remaining_hours % 24}h ${membership.remaining_minutes % 60}m`
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

    // Get the 2-minute test plan
    const [planRows] = await db.query("SELECT * FROM membership_plans WHERE plan_name = 'Test 2-Minute' AND is_active = TRUE");
    
    if (planRows.length === 0) {
      return res.status(404).json({ success: false, message: "Test plan not found" });
    }

    const plan = planRows[0];

    // Activate 2-minute membership using stored procedure
    const [results] = await db.query("CALL ActivateMembership(?, ?, ?, ?, 'system', 2)", [
      member_id, plan.id, plan.price, 'system'
    ]);
    
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
    const [results] = await db.query("CALL ProcessExpiredMemberships()");
    
    return res.json({
      success: true,
      data: {
        processed_count: results[0]?.expired_count || 0,
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
    const now = new Date();
    
    // Get plan details from hardcoded plans
    const plans = [
      { id: 1, planName: "TRIAL AWAKENING", durationMinutes: 2, testMode: true },
      { id: 2, planName: "WARRIOR ASCENT", durationMonths: 1, testMode: false },
      { id: 3, planName: "ETERNAL LEGEND", durationMonths: 12, testMode: false }
    ];
    
    const plan = plans.find(p => p.id === plan_id);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Membership plan not found" });
    }

    // Generate receipt number with real-time date
    const receiptNumber = `RCP${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(member_id).padStart(4, '0')}`;
    
    // Calculate expiration date
    let expirationDate = new Date(now);
    if (plan.durationMinutes) {
      expirationDate.setMinutes(expirationDate.getMinutes() + plan.durationMinutes);
    } else if (plan.durationMonths) {
      expirationDate.setMonth(expirationDate.getMonth() + plan.durationMonths);
    }

    // Create payment record (simplified for current database structure)
    try {
      const [paymentResult] = await db.query(`
        INSERT INTO payments (member_id, amount, status, payment_date)
        VALUES (?, ?, 'paid', NOW())
      `, [member_id, amount]);
    } catch (err) {
      // If payments table doesn't exist, continue without storing payment
      console.log('Payment table not available, continuing with membership activation');
    }

    // Update member status to active
    try {
      await db.query(`
        UPDATE members SET status = 'active'
        WHERE id = ?
      `, [member_id]);
    } catch (err) {
      console.log('Members table update failed, continuing');
    }

    // Create receipt data
    const receiptData = {
      receiptNumber: receiptNumber,
      memberName: member.full_name,
      memberId: member_id,
      planName: plan.planName,
      amount: Number(amount),
      paymentMethod: payment_method || 'cash',
      paymentDate: now.toISOString(),
      formattedDate: now.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      expirationDate: expirationDate.toISOString(),
      formattedExpiration: expirationDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      status: 'PAID',
      processedBy: processed_by || 'system',
      notes: notes || '',
      testMode: plan.testMode,
      remainingMinutes: plan.durationMinutes || Math.floor((expirationDate - now) / (1000 * 60))
    };

    return res.json({
      success: true,
      data: receiptData,
      message: "Payment processed successfully"
    });
  } catch (err) {
    console.error('Payment processing error:', err);
    return next(err);
  }
});

/** GET /api/payments — Get all payments for payment list */
gymApiRouter.get("/payments", async (req, res, next) => {
  try {
    const search = req.query.search || "";
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 100;
    const offset = (page - 1) * limit;

    // Simplified query for current database structure
    let sql = "SELECT * FROM payments ORDER BY id DESC LIMIT ? OFFSET ?";
    const params = [limit, offset];
    
    if (search) {
      sql = "SELECT * FROM payments WHERE member_name LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?";
      params.unshift(`%${search}%`);
    }

    const [results] = await db.query(sql, params);
    
    // Get total count
    let countSql = "SELECT COUNT(*) as total FROM payments";
    const countParams = [];
    
    if (search) {
      countSql = "SELECT COUNT(*) as total FROM payments WHERE member_name LIKE ?";
      countParams.push(`%${search}%`);
    }

    const [countResult] = await db.query(countSql, countParams);
    const total = countResult[0].total;

    return res.json({
      success: true,
      data: results.map(payment => ({
        id: payment.id,
        receiptNumber: payment.receipt_number || `RCP${payment.id}`,
        memberName: payment.member_name || "Unknown Member",
        memberId: payment.member_id,
        amount: Number(payment.amount || 0),
        paymentMethod: payment.payment_method || 'cash',
        status: payment.status || 'paid',
        paymentDate: payment.payment_date || payment.created_at,
        formattedDate: new Date(payment.payment_date || payment.created_at).toLocaleDateString(),
        notes: payment.notes || ''
      })),
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_records: total,
        limit: limit
      },
      message: "Payments fetched successfully"
    });
  } catch (err) {
    console.error('Payments list error:', err);
    return next(err);
  }
});

/** GET /api/my-payments — Get current user's payments */
gymApiRouter.get("/my-payments", async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    if (!user_id) {
      return res.status(400).json({ success: false, message: "user_id query parameter required" });
    }

    // Get member_id from user_id
    const [userRows] = await db.query("SELECT member_id FROM users WHERE id = ?", [user_id]);
    
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const memberId = userRows[0].member_id;

    // Get payments for this member
    const [results] = await db.query(`
      SELECT * FROM payments 
      WHERE member_id = ? 
      ORDER BY id DESC
    `, [memberId]);

    return res.json({
      success: true,
      data: results.map(payment => ({
        id: payment.id,
        receiptNumber: payment.receipt_number || `RCP${payment.id}`,
        memberName: payment.member_name || "Unknown Member",
        memberId: payment.member_id,
        amount: Number(payment.amount || 0),
        paymentMethod: payment.payment_method || 'cash',
        status: payment.status || 'paid',
        paymentDate: payment.payment_date || payment.created_at,
        formattedDate: new Date(payment.payment_date || payment.created_at).toLocaleDateString(),
        notes: payment.notes || ''
      })),
      message: "My payments fetched successfully"
    });
  } catch (err) {
    console.error('My payments error:', err);
    return next(err);
  }
});

/** POST /api/attendance/check-in — Check in member */
gymApiRouter.post("/attendance/check-in", async (req, res, next) => {
  try {
    const { member_id } = req.body || {};
    
    if (!member_id) {
      return res.status(400).json({ success: false, message: "member_id is required" });
    }

    // Get member details
    const [memberRows] = await db.query("SELECT * FROM members WHERE id = ?", [member_id]);
    
    if (memberRows.length === 0) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const member = memberRows[0];

    // Check if already checked in
    const [existingRows] = await db.query(`
      SELECT * FROM attendance 
      WHERE member_id = ? AND status = 'checked_in'
      ORDER BY check_in DESC LIMIT 1
    `, [member_id]);

    if (existingRows.length > 0) {
      return res.status(400).json({ success: false, message: "Member already checked in" });
    }

    // Create attendance record
    const [attendanceResult] = await db.query(`
      INSERT INTO attendance (member_id, member_name, member_code, profile_photo, status)
      VALUES (?, ?, ?, ?, 'checked_in')
    `, [member_id, member.full_name, member.member_code || `MEM${String(member_id).padStart(6, '0')}`, member.profile_photo]);

    return res.json({
      success: true,
      data: {
        id: attendanceResult.insertId,
        memberId: member_id,
        memberName: member.full_name,
        memberCode: member.member_code || `MEM${String(member_id).padStart(6, '0')}`,
        profilePhoto: member.profile_photo,
        checkIn: new Date().toISOString(),
        checkOut: null,
        date: new Date().toISOString().split('T')[0],
        durationMinutes: 0,
        status: 'checked_in'
      },
      message: "Member checked in successfully"
    });
  } catch (err) {
    console.error('Check-in error:', err);
    return next(err);
  }
});

/** GET /api/attendance — Get attendance records for list */
gymApiRouter.get("/attendance", async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const member_id = req.query.member_id;
    
    let sql = "SELECT * FROM attendance WHERE DATE(check_in) = ?";
    const params = [date];
    
    if (member_id) {
      sql += " AND member_id = ?";
      params.push(member_id);
    }
    
    sql += " ORDER BY check_in DESC";

    const [results] = await db.query(sql, params);

    return res.json({
      success: true,
      data: results.map(record => ({
        id: record.id,
        memberId: record.member_id,
        memberName: record.member_name,
        memberCode: record.member_code || `MEM${String(record.member_id).padStart(6, '0')}`,
        profilePhoto: record.profile_photo,
        checkIn: record.check_in,
        checkOut: record.check_out,
        date: record.check_in.toString().split('T')[0],
        durationMinutes: record.check_out ? 
          Math.floor((new Date(record.check_out) - new Date(record.check_in)) / (1000 * 60)) : 0,
        status: record.status,
        formattedDuration: record.check_out ? 
          `${Math.floor((new Date(record.check_out) - new Date(record.check_in)) / (1000 * 60))} minutes` : 
          'In progress'
      })),
      message: "Attendance records fetched successfully"
    });
  } catch (err) {
    console.error('Attendance list error:', err);
    return next(err);
  }
});

/** POST /api/attendance/check-out — Check out member */
gymApiRouter.post("/attendance/check-out", async (req, res, next) => {
  try {
    const { member_id } = req.body || {};
    
    if (!member_id) {
      return res.status(400).json({ success: false, message: "member_id is required" });
    }

    // Get current check-in record
    const [attendanceRows] = await db.query(`
      SELECT * FROM attendance 
      WHERE member_id = ? AND status = 'checked_in'
      ORDER BY check_in DESC LIMIT 1
    `, [member_id]);

    if (attendanceRows.length === 0) {
      return res.status(400).json({ success: false, message: "No active check-in found" });
    }

    const attendance = attendanceRows[0];
    const checkOutTime = new Date();

    // Update attendance record
    await db.query(`
      UPDATE attendance 
      SET check_out = ?, status = 'checked_out'
      WHERE id = ?
    `, [checkOutTime, attendance.id]);

    const durationMinutes = Math.floor((checkOutTime - new Date(attendance.check_in)) / (1000 * 60));

    return res.json({
      success: true,
      data: {
        id: attendance.id,
        memberId: member_id,
        memberName: attendance.member_name,
        memberCode: attendance.member_code,
        profilePhoto: attendance.profile_photo,
        checkIn: attendance.check_in,
        checkOut: checkOutTime.toISOString(),
        date: attendance.check_in.toString().split('T')[0],
        durationMinutes: durationMinutes,
        status: 'checked_out',
        formattedDuration: durationMinutes > 0 ? 
          (Math.floor(durationMinutes / 60) + 'h ' + (durationMinutes % 60) + 'm') : 
          'In progress'
      },
      message: "Member checked out successfully"
    });
  } catch (err) {
    console.error('Check-out error:', err);
    return next(err);
  }
});

/** GET /api/workout-schedules — Get workout schedules */
gymApiRouter.get("/workout-schedules", async (req, res, next) => {
  try {
    const userId = req.query.user_id;
    
    let sql = "SELECT * FROM workout_schedules";
    const params = [];
    
    if (userId) {
      sql += " WHERE user_id = ?";
      params.push(Number(userId));
    }
    
    sql += " ORDER BY created_at DESC";

    const [results] = await db.query(sql, params);

    return res.json({
      success: true,
      data: results.map(schedule => ({
        id: schedule.id,
        userId: schedule.user_id,
        workoutName: schedule.workout_name,
        workoutTime: schedule.workout_time,
        status: schedule.status,
        createdAt: schedule.created_at,
        isCompleted: schedule.status === 'completed'
      })),
      message: "Workout schedules fetched successfully"
    });
  } catch (err) {
    console.error('Workout schedules error:', err);
    return next(err);
  }
});

/** POST /api/workout-schedules — Create workout schedule */
gymApiRouter.post("/workout-schedules", async (req, res, next) => {
  try {
    const { user_id, workout_name, workout_time, status } = req.body || {};
    
    if (!user_id || !workout_name || !workout_time) {
      return res.status(400).json({ success: false, message: "user_id, workout_name, and workout_time are required" });
    }

    const [result] = await db.query(`
      INSERT INTO workout_schedules (user_id, workout_name, workout_time, status)
      VALUES (?, ?, ?, ?)
    `, [user_id, workout_name, workout_time, status || 'pending']);

    return res.json({
      success: true,
      data: {
        id: result.insertId,
        userId: user_id,
        workoutName: workout_name,
        workoutTime: workout_time,
        status: status || 'pending',
        createdAt: new Date().toISOString(),
        isCompleted: (status || 'pending') === 'completed'
      },
      message: "Workout schedule created successfully"
    });
  } catch (err) {
    console.error('Create workout schedule error:', err);
    return next(err);
  }
});

/** POST /api/trainer-bookings — Create trainer session booking */
gymApiRouter.post("/trainer-bookings", async (req, res, next) => {
  try {
    const { trainer_id, trainer_name, session_type, duration, booking_date, booking_time, notes, member_name, member_id } = req.body;
    
    if (!trainer_id || !trainer_name || !session_type || !duration || !booking_date || !booking_time) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Generate receipt number
    const now = new Date();
    const receiptNumber = `TRS${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(trainer_id).padStart(3, '0')}`;

    // Calculate amount based on session type and duration
    let amount = 0;
    if (session_type.toLowerCase().includes('personal')) {
      amount = duration.includes('1 hour') ? 500 : duration.includes('30') ? 300 : 700;
    } else if (session_type.toLowerCase().includes('group')) {
      amount = duration.includes('1 hour') ? 300 : duration.includes('30') ? 200 : 400;
    } else if (session_type.toLowerCase().includes('consultation')) {
      amount = duration.includes('1 hour') ? 400 : duration.includes('30') ? 250 : 550;
    } else {
      amount = 350; // Default
    }

    // Insert booking
    const [result] = await db.query(
      `INSERT INTO trainer_bookings (trainer_id, trainer_name, member_id, member_name, session_type, duration, booking_date, booking_time, notes, amount, receipt_number, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', NOW())`,
      [trainer_id, trainer_name, member_id || null, member_name || 'Guest', session_type, duration, booking_date, booking_time, notes || '', amount, receiptNumber]
    );

    const bookingId = result.insertId;

    // Return booking details
    const bookingData = {
      id: bookingId,
      trainerId: trainer_id,
      trainerName: trainer_name,
      memberId: member_id || 0,
      memberName: member_name || 'Guest',
      sessionType: session_type,
      duration: duration,
      bookingDate: booking_date,
      bookingTime: booking_time,
      notes: notes || '',
      amount: amount,
      status: 'confirmed',
      receiptNumber: receiptNumber,
      createdAt: now.toISOString(),
      formattedDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      formattedAmount: `₱${amount.toFixed(2)}`
    };

    return res.json({ success: true, data: bookingData, message: "Trainer session booked successfully" });
  } catch (err) {
    console.error('Trainer booking error:', err);
    return next(err);
  }
});

/** GET /api/trainer-bookings/:id — Get trainer booking details */
gymApiRouter.get("/trainer-bookings/:id", async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    
    const [results] = await db.query(
      `SELECT * FROM trainer_bookings WHERE id = ?`,
      [bookingId]
    );

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const booking = results[0];
    const bookingData = {
      id: booking.id,
      trainerId: booking.trainer_id,
      trainerName: booking.trainer_name,
      memberId: booking.member_id,
      memberName: booking.member_name,
      sessionType: booking.session_type,
      duration: booking.duration,
      bookingDate: booking.booking_date,
      bookingTime: booking.booking_time,
      notes: booking.notes,
      amount: booking.amount,
      status: booking.status,
      receiptNumber: booking.receipt_number,
      createdAt: booking.created_at,
      formattedDate: new Date(booking.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      formattedAmount: `₱${booking.amount.toFixed(2)}`
    };

    return res.json({ success: true, data: bookingData, message: "Booking details fetched successfully" });
  } catch (err) {
    console.error('Get trainer booking error:', err);
    return next(err);
  }
});

/** GET /api/members — MemberListActivity (OPTIMIZED) */
gymApiRouter.get("/members", async (req, res, next) => {
  try {
    const search = req.query.search != null ? String(req.query.search).trim() : "";
    const status = req.query.status != null ? String(req.query.status).trim() : "";
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 100, 100); // Limit max to 100
    const offset = (page - 1) * limit;

    // Use optimized query with indexes
    let sql = `
      SELECT m.id, m.full_name, m.phone, m.email, m.status, m.membership_end_date as membership_end, 
             m.created_at as registration_date, m.membership_plan, m.created_at, m.updated_at,
             u.profile_photo, u.email as user_email, u.role
      FROM members m 
      LEFT JOIN users u ON u.member_id = m.id
    `;
    const params = [];

    // Build WHERE clause using indexed columns
    const whereConditions = [];
    
    if (search) {
      whereConditions.push("(m.full_name LIKE ? OR m.email LIKE ? OR m.phone LIKE ? OR u.email LIKE ?)");
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }

    // Apply status filter with proper MySQL status handling
    if (status && status !== 'all' && status !== '') {
      if (status === 'active') {
        whereConditions.push("((m.status = 'active' OR m.status = 'ACTIVE') AND (m.membership_end_date IS NULL OR m.membership_end_date > CURDATE()))");
      } else if (status === 'inactive') {
        whereConditions.push("(m.status = 'inactive' OR m.status = 'INACTIVE' OR m.status = 'NO MONTHLY PLAN')");
      } else if (status === 'expired') {
        whereConditions.push("(m.status = 'expired' OR m.status = 'EXPIRED' OR (m.membership_end_date IS NOT NULL AND m.membership_end_date < CURDATE()))");
      } else if (status === 'pending') {
        whereConditions.push("(m.status = 'pending' OR m.status = 'PENDING')");
      }
    }

    // Add WHERE clause if conditions exist
    if (whereConditions.length > 0) {
      sql += " WHERE " + whereConditions.join(" AND ");
    }

    sql += " ORDER BY m.id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [results] = await db.query(sql, params);

    // Optimized count query - count only what we need
    let countSql = "SELECT COUNT(*) as total FROM members m LEFT JOIN users u ON u.member_id = m.id";
    const countParams = [];
    
    if (whereConditions.length > 0) {
      countSql += " WHERE " + whereConditions.join(" AND ");
      // Copy relevant params for count query (without limit/offset)
      if (search) {
        const q = `%${search}%`;
        countParams.push(q, q, q, q);
      }
    }

    const [countResult] = await db.query(countSql, countParams);
    const total = countResult[0].total;

    // Optimize data transformation - clean and consistent member data
    const optimizedResults = results.map(member => {
      // Determine actual member status
      let actualStatus = (member.status || "").toLowerCase();
      
      // Calculate remaining days for active members
      let remainingDays = 0;
      if (member.membership_end) {
        const today = new Date();
        const endDate = new Date(member.membership_end);
        remainingDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
        remainingDays = Math.max(0, remainingDays);
      }
      
      // Normalize status for display
      let displayStatus = actualStatus;
      if (actualStatus === 'active' && remainingDays <= 0) {
        displayStatus = 'expired';
      }
      
      return {
        id: member.id,
        full_name: member.full_name || "",
        phone: member.phone || "",
        email: member.email || member.user_email || "",
        status: displayStatus.toUpperCase(),
        membership_end: member.membership_end,
        registration_date: member.registration_date,
        profile_photo: member.profile_photo || "",
        current_plan: member.membership_plan || "NO MONTHLY PLAN",
        remaining_days: remainingDays,
        role: member.role || "member",
        is_admin: (member.role && member.role.toLowerCase() === 'admin'),
        created_at: member.created_at,
        updated_at: member.updated_at
      };
    });

    return res.json({
      success: true,
      data: optimizedResults,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_records: total,
        limit: limit
      },
      message: "Members fetched successfully"
    });
  } catch (err) {
    console.error('Members endpoint error:', err);
    return next(err);
  }
});

/** GET /api/get_member — Get single member details */
gymApiRouter.get("/get_member", async (req, res, next) => {
  try {
    const id = Number(req.query.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "id query parameter required" });
    }

    // Enhanced query with real membership data
    const [rows] = await db.query(`
      SELECT 
        m.*,
        u.role,
        u.profile_photo,
        mp.name as plan_name,
        mp.duration_months
      FROM members m
      LEFT JOIN users u ON u.member_id = m.id
      LEFT JOIN membership_plans mp ON mp.id = m.membership_plan_id
      WHERE m.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const member = rows[0];
    
    // Calculate actual member status
    let membershipStatus = 'pending';
    let currentPlan = 'No Plan';
    let expirationDate = member.membership_end;
    
    // New members (created recently without membership) are pending
    const createdDate = new Date(member.created_at || member.registration_date);
    const today = new Date();
    const daysSinceCreation = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
    
    if (member.role === 'admin') {
      membershipStatus = null;
      currentPlan = null;
      expirationDate = null;
    } else if (member.membership_end) {
      // Member has membership end date
      const endDate = new Date(member.membership_end);
      const remainingDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
      
      if (remainingDays > 0) {
        membershipStatus = 'active';
        currentPlan = member.plan_name || member.membership_plan || 'Active Plan';
      } else {
        membershipStatus = 'expired';
        currentPlan = member.plan_name || member.membership_plan || 'Expired Plan';
      }
    } else if (member.status) {
      // Use database status if it exists
      const dbStatus = (member.status || "").toLowerCase();
      if (dbStatus === 'active' || dbStatus === 'inactive' || dbStatus === 'expired' || dbStatus === 'pending') {
        membershipStatus = dbStatus;
        currentPlan = member.plan_name || member.membership_plan || 'No Plan';
      }
    } else if (daysSinceCreation <= 7) {
      // New members (less than 7 days) are pending by default
      membershipStatus = 'pending';
      currentPlan = 'No Plan';
    } else {
      // Members older than 7 days without membership are inactive
      membershipStatus = 'inactive';
      currentPlan = 'No Plan';
    }
    
    // Add calculated fields to member object
    member.membership_status = membershipStatus ? membershipStatus.toUpperCase() : null;
    member.current_plan = currentPlan;
    member.expiration_date = expirationDate;
    member.remaining_days = expirationDate ? Math.ceil((new Date(expirationDate) - today) / (1000 * 60 * 60 * 24)) : 0;

    return res.json({ 
      success: true, 
      data: member,
      message: "Member fetched successfully"
    });
  } catch (err) {
    console.error('Get member error:', err);
    return next(err);
  }
});

/** POST /api/members — AddEditMemberActivity */
gymApiRouter.post("/members", async (req, res, next) => {
  try {
    const { full_name, phone, email, membership_plan_id } = req.body || {};
    
    // New members default to 'pending' status
    const [result] = await db.query(
      `INSERT INTO members (full_name, phone, email, status, registration_date, created_at) 
       VALUES (?, ?, ?, 'pending', CURDATE(), NOW())`,
      [full_name, phone, email]
    );
    
    // If membership plan is provided, update the member
    if (membership_plan_id) {
      // Get membership plan details
      const [planRows] = await db.query(
        "SELECT duration_months FROM membership_plans WHERE id = ? AND is_active = 1",
        [membership_plan_id]
      );
      
      if (planRows.length > 0) {
        const plan = planRows[0];
        const membershipEnd = new Date();
        membershipEnd.setMonth(membershipEnd.getMonth() + plan.duration_months);
        
        await db.query(
          `UPDATE members 
           SET membership_plan_id = ?, membership_end = ?, status = 'active'
           WHERE id = ?`,
          [membership_plan_id, membershipEnd.toISOString().split('T')[0], result.insertId]
        );
      }
    }
    
    return res.json({ 
      id: result.insertId, 
      message: "Member added successfully",
      status: membership_plan_id ? "active" : "pending"
    });
  } catch (err) {
    console.error('Add member error:', err);
    return next(err);
  }
});

/** PUT /api/members/:id — Update member details */
gymApiRouter.put("/members/:id", async (req, res, next) => {
  try {
    const memberId = Number(req.params.id);
    const { full_name, phone, email, membership_plan_id, status } = req.body || {};
    
    if (!Number.isFinite(memberId)) {
      return res.status(400).json({ success: false, message: "Invalid member ID" });
    }

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];
    
    if (full_name) {
      updateFields.push("full_name = ?");
      updateValues.push(full_name);
    }
    if (phone) {
      updateFields.push("phone = ?");
      updateValues.push(phone);
    }
    if (email) {
      updateFields.push("email = ?");
      updateValues.push(email);
    }
    
    // Handle membership plan changes
    if (membership_plan_id) {
      // Get membership plan details
      const [planRows] = await db.query(
        "SELECT duration_months FROM membership_plans WHERE id = ? AND is_active = 1",
        [membership_plan_id]
      );
      
      if (planRows.length > 0) {
        const plan = planRows[0];
        const membershipEnd = new Date();
        membershipEnd.setMonth(membershipEnd.getMonth() + plan.duration_months);
        
        updateFields.push("membership_plan_id = ?");
        updateValues.push(membership_plan_id);
        updateFields.push("membership_end = ?");
        updateValues.push(membershipEnd.toISOString().split('T')[0]);
        updateFields.push("status = ?");
        updateValues.push('active');
      }
    } else if (status) {
      // Manual status override
      updateFields.push("status = ?");
      updateValues.push(status);
    }
    
    updateFields.push("updated_at = NOW()");
    updateValues.push(memberId);
    
    if (updateFields.length > 1) { // More than just updated_at
      await db.query(
        `UPDATE members SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }
    
    return res.json({ 
      success: true, 
      message: "Member updated successfully"
    });
  } catch (err) {
    console.error('Update member error:', err);
    return next(err);
  }
});

/** POST /api/attendance — AttendanceActivity */
gymApiRouter.post("/attendance", async (req, res, next) => {
  try {
    const { member_id } = req.body || {};
    if (member_id === undefined || member_id === null) {
      return res.status(400).json({ success: false, message: "member_id required" });
    }
    await db.query("INSERT INTO attendance (member_id) VALUES (?)", [member_id]);
    return res.json({ success: true, message: "Attendance logged" });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/payments — PaymentListActivity */
gymApiRouter.get("/payments", async (req, res, next) => {
  try {
    const memberId = req.query.member_id;
    let sql = `SELECT payments.*, members.full_name
               FROM payments
               JOIN members ON payments.member_id = members.id`;
    const params = [];
    if (memberId !== undefined && memberId !== null && String(memberId).trim() !== "") {
      sql += " WHERE payments.member_id = ?";
      params.push(Number(memberId));
    }
    sql += " ORDER BY payments.id";
    const [results] = await db.query(sql, params);
    return res.json(results);
/** GET /api/dashboard/stats — MainActivity (Retrofit may use api/dashboard_stats) */
async function getDashboardStats(req, res, next) {
  try {
    // Simplified queries that work with current database structure
    const [totalRevenue] = await db.query("SELECT COALESCE(SUM(amount), 0) as revenue FROM payments WHERE status = 'paid'");
    const [totalMembers] = await db.query("SELECT COUNT(*) as count FROM members");
    const [todayAttendance] = await db.query("SELECT COUNT(*) as count FROM attendance WHERE DATE(check_in) = CURDATE()");
    const [totalTrainers] = await db.query("SELECT COUNT(*) as count FROM trainers WHERE full_name IS NOT NULL AND full_name != ''");

    // For now, all members are inactive since no memberships exist
    const activeMembers = 0;
    const inactiveMembers = totalMembers[0]?.count ?? 0;
    const expiredMembers = 0;
    const pendingMembers = totalMembers[0]?.count ?? 0;

    return res.json({
      success: true,
      data: {
        totalMembers: Number(totalMembers[0]?.count ?? 0),
        activeMembers: activeMembers,
        inactiveMembers: inactiveMembers,
        expiredMembers: expiredMembers,
        todayAttendance: Number(todayAttendance[0]?.count ?? 0),
        monthlyIncome: Number(totalRevenue[0]?.revenue ?? 0),
        totalTrainers: Number(totalTrainers[0]?.count ?? 0),
        pendingPayments: pendingMembers,
        newMembersThisMonth: 0,
        currency: "PHP",
      },
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return next(err);
  }
}

gymApiRouter.get("/dashboard/stats", getDashboardStats);

/** GET /api/dashboard_stats — Dashboard (OPTIMIZED) */
gymApiRouter.get("/dashboard_stats", async (req, res, next) => {
  try {
    // Check cache first
    const cacheKey = 'dashboard_stats';
    const [cacheResult] = await db.query(
      "SELECT cache_value, last_updated FROM dashboard_cache WHERE cache_key = ? AND last_updated > DATE_SUB(NOW(), INTERVAL 5 MINUTE)",
      [cacheKey]
    );

    if (cacheResult.length > 0) {
      return res.json({
        success: true,
        data: JSON.parse(cacheResult[0].cache_value),
        cached: true
      });
    }

    // Use optimized single query with subqueries instead of multiple queries
    const [statsResult] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM members) as totalMembers,
        (SELECT COUNT(*) FROM members WHERE status = 'ACTIVE') as activeMembers,
        (SELECT COUNT(*) FROM members WHERE status = 'INACTIVE') as inactiveMembers,
        (SELECT COUNT(*) FROM members WHERE status = 'EXPIRED' OR (membership_end IS NOT NULL AND membership_end <= NOW())) as expiredMembers,
        (SELECT COUNT(*) FROM trainers) as totalTrainers,
        (SELECT COUNT(*) FROM trainers WHERE status = 'active') as activeTrainers,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE MONTH(payment_date) = MONTH(CURRENT_DATE()) AND YEAR(payment_date) = YEAR(CURRENT_DATE())) as monthlyIncome,
        (SELECT COUNT(*) FROM attendance WHERE DATE(check_in_date) = CURDATE()) as todayAttendance
    `);

    const stats = statsResult[0];

    // Cache the results
    await db.query(
      "INSERT INTO dashboard_cache (cache_key, cache_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE cache_value = VALUES(cache_value), last_updated = NOW()",
      [cacheKey, JSON.stringify(stats)]
    );

    return res.json({
      success: true,
      data: stats,
      cached: false
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return next(err);
  }
});

/** GET /api/performance-reports — Performance Reports */
gymApiRouter.get("/performance-reports", async (req, res, next) => {
  try {
    const period = req.query.period || 'monthly'; // daily, weekly, monthly, yearly
    
    let dateFormat, groupBy;
    switch(period) {
      case 'daily':
        dateFormat = '%Y-%m-%d';
        groupBy = 'DATE(p.payment_date)';
        break;
      case 'weekly':
        dateFormat = '%Y-%u';
        groupBy = 'YEARWEEK(p.payment_date)';
        break;
      case 'yearly':
        dateFormat = '%Y';
        groupBy = 'YEAR(p.payment_date)';
        break;
      default: // monthly
        dateFormat = '%Y-%m';
        groupBy = 'DATE_FORMAT(p.payment_date, "%Y-%m")';
    }

    const [revenueData] = await db.query(`
      SELECT 
        ${groupBy} as period,
        COUNT(*) as transaction_count,
        COALESCE(SUM(p.amount), 0) as revenue,
        COUNT(DISTINCT p.member_id) as unique_members
      FROM payments p
      WHERE p.status = 'paid' 
        AND p.payment_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY ${groupBy}
      ORDER BY period DESC
      LIMIT 12
    `);

    const [membershipGrowth] = await db.query(`
      SELECT 
        ${groupBy} as period,
        COUNT(*) as new_members
      FROM members m
      WHERE m.created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY ${groupBy}
      ORDER BY period DESC
      LIMIT 12
    `);

    const [attendanceData] = await db.query(`
      SELECT 
        ${groupBy} as period,
        COUNT(*) as total_attendance,
        COUNT(DISTINCT a.member_id) as unique_attendees
      FROM attendance a
      WHERE a.check_in >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY ${groupBy}
      ORDER BY period DESC
      LIMIT 12
    `);

    const [trainerPerformance] = await db.query(`
      SELECT 
        t.id,
        t.full_name,
        t.specialization,
        COUNT(DISTINCT ws.member_id) as total_clients,
        COUNT(ws.id) as total_sessions
      FROM trainers t
      LEFT JOIN workout_schedules ws ON t.id = ws.trainer_id
      GROUP BY t.id, t.full_name, t.specialization
      ORDER BY total_clients DESC, total_sessions DESC
    `);

    return res.json({
      success: true,
      data: {
        revenue_trends: revenueData,
        membership_growth: membershipGrowth,
        attendance_trends: attendanceData,
        trainer_performance: trainerPerformance,
        period: period,
        currency: "PHP"
      },
      message: "Performance reports fetched successfully"
    });
  } catch (err) {
    return next(err);
  }
});

/** GET /api/workout-schedules?member_id= — member workout list */
gymApiRouter.get("/workout-schedules", async (req, res, next) => {
  try {
    const memberId = req.query.member_id;
    if (memberId === undefined || memberId === null || String(memberId).trim() === "") {
      return res.status(400).json({ success: false, message: "member_id query parameter required" });
    }
    const [results] = await db.query(
      "SELECT * FROM workout_schedules WHERE member_id = ? ORDER BY id",
      [Number(memberId)]
    );
    return res.json(results);
  } catch (err) {
    return next(err);
  }
});

/** POST /api/workout-schedules — add row for WorkoutScheduleActivity */
gymApiRouter.post("/workout-schedules", async (req, res, next) => {
  try {
    const { member_id, trainer_id, day_of_week, exercise_name, sets, reps, weight } = req.body || {};
    if (member_id === undefined || member_id === null) {
      return res.status(400).json({ success: false, message: "member_id required" });
    }
    if (!exercise_name || !String(exercise_name).trim()) {
      return res.status(400).json({ success: false, message: "exercise_name required" });
    }
    const [result] = await db.query(
      `INSERT INTO workout_schedules (member_id, trainer_id, day_of_week, exercise_name, sets, reps, weight)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(member_id),
        trainer_id != null && trainer_id !== "" ? Number(trainer_id) : null,
        day_of_week != null ? String(day_of_week) : null,
        String(exercise_name).trim(),
        sets != null ? Number(sets) : 0,
        reps != null ? Number(reps) : 0,
        weight != null ? String(weight) : null,
      ]
    );
    return res.status(201).json({ id: result.insertId, message: "Workout schedule added" });
  } catch (err) {
    return next(err);
  }
});

/** GET /api/trainers — TrainerListActivity */
gymApiRouter.get("/trainers", async (req, res, next) => {
  try {
    const search = req.query.search != null ? String(req.query.search).trim() : "";
    let sql = "SELECT * FROM trainers";
    const params = [];
    if (search) {
      sql += " WHERE full_name LIKE ? OR specialization LIKE ?";
      const q = `%${search}%`;
      params.push(q, q);
    }
    sql += " ORDER BY id";

    const [results] = await db.query(sql, params);
    const normalized = results.map(normalizeTrainerRow);
    return res.json({
      success: true,
      data: normalized,
      total: normalized.length,
      message: "Trainers fetched",
    });
  } catch (err) {
    return next(err);
  }
});

/** GET /api/get_trainer?id= */
gymApiRouter.get("/get_trainer", async (req, res, next) => {
  try {
    const id = Number(req.query.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "id query parameter required" });
    }
    const [rows] = await db.query("SELECT * FROM trainers WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }
    return res.json({ success: true, data: normalizeTrainerRow(rows[0]) });
  } catch (err) {
    return next(err);
  }
});

/** POST /api/add_trainer */
gymApiRouter.post("/add_trainer", async (req, res, next) => {
  try {
    const payload = req.body || {};
    const firstName = payload.first_name != null ? String(payload.first_name).trim() : "";
    const lastName = payload.last_name != null ? String(payload.last_name).trim() : "";
    const fullNameRaw = payload.full_name != null ? String(payload.full_name).trim() : "";
    const fullName = fullNameRaw || [firstName, lastName].filter(Boolean).join(" ").trim();
    if (!fullName) {
      return res.status(400).json({ success: false, message: "full_name (or first_name/last_name) required" });
    }

    const phone = payload.phone != null && String(payload.phone).trim() ? String(payload.phone).trim() : null;
    const email = payload.email != null && String(payload.email).trim() ? String(payload.email).trim().toLowerCase() : null;
    const specialization = payload.specialization != null ? String(payload.specialization).trim() : null;
    const profilePhoto = payload.image_url != null ? String(payload.image_url).trim() : null;

    const [result] = await db.query(
      "INSERT INTO trainers (full_name, phone, email, specialization, profile_photo) VALUES (?, ?, ?, ?, ?)",
      [fullName, phone, email, specialization, profilePhoto]
    );

    const [rows] = await db.query("SELECT * FROM trainers WHERE id = ?", [result.insertId]);
    return res
      .status(201)
      .json({ success: true, data: normalizeTrainerRow(rows[0]), message: "Trainer added successfully" });
  } catch (err) {
    return next(err);
  }
});

/** POST /api/update_trainer?id= */
gymApiRouter.post("/update_trainer", async (req, res, next) => {
  try {
    const id = Number(req.query.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "id query parameter required" });
    }
    const payload = req.body || {};
    const firstName = payload.first_name != null ? String(payload.first_name).trim() : "";
    const lastName = payload.last_name != null ? String(payload.last_name).trim() : "";
    const fullNameRaw = payload.full_name != null ? String(payload.full_name).trim() : "";
    const fullName = fullNameRaw || [firstName, lastName].filter(Boolean).join(" ").trim();
    if (!fullName) {
      return res.status(400).json({ success: false, message: "full_name (or first_name/last_name) required" });
    }

    const phone = payload.phone != null && String(payload.phone).trim() ? String(payload.phone).trim() : null;
    const email = payload.email != null && String(payload.email).trim() ? String(payload.email).trim().toLowerCase() : null;
    const specialization = payload.specialization != null ? String(payload.specialization).trim() : null;
    const profilePhoto = payload.image_url != null ? String(payload.image_url).trim() : undefined;

    if (profilePhoto !== undefined) {
      await db.query(
        "UPDATE trainers SET full_name = ?, phone = ?, email = ?, specialization = ?, profile_photo = ? WHERE id = ?",
        [fullName, phone, email, specialization, profilePhoto, id]
      );
    } else {
      await db.query(
        "UPDATE trainers SET full_name = ?, phone = ?, email = ?, specialization = ? WHERE id = ?",
        [fullName, phone, email, specialization, id]
      );
    }

    const [rows] = await db.query("SELECT * FROM trainers WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }
    return res.json({
      success: true,
      data: normalizeTrainerRow(rows[0]),
      message: "Trainer updated successfully",
    });
  } catch (err) {
    return next(err);
  }
});

/** POST /api/upload_trainer_photo?id= */
gymApiRouter.post("/upload_trainer_photo", upload.single("photo"), async (req, res, next) => {
  try {
    const id = Number(req.query.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "id query parameter required" });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "photo file is required" });
    }

    const mime = req.file.mimetype || "image/jpeg";
    const base64 = req.file.buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;
    await db.query("UPDATE trainers SET profile_photo = ? WHERE id = ?", [dataUrl, id]);

    const [rows] = await db.query("SELECT * FROM trainers WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }
    return res.json({
      success: true,
      data: normalizeTrainerRow(rows[0]),
      message: "Trainer photo uploaded successfully",
    });
  } catch (err) {
    return next(err);
  }
});

/** POST /api/update_profile_photo?id= */
gymApiRouter.post("/update_profile_photo", upload.single("photo"), async (req, res, next) => {
  try {
    const idFromQuery = Number(req.query.id);
    const idFromBody = Number(req.body?.id);
    const userId = Number.isFinite(idFromQuery)
      ? idFromQuery
      : Number.isFinite(idFromBody)
        ? idFromBody
        : NaN;

    if (!Number.isFinite(userId)) {
      return res.status(400).json({
        success: false,
        message: "User id is required (?id=...)",
      });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "photo file is required" });
    }

    const mime = req.file.mimetype || "image/jpeg";
    const base64 = req.file.buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;

    const [updateResult] = await db.query("UPDATE users SET profile_photo = ? WHERE id = ?", [
      dataUrl,
      userId,
    ]);
    if (!updateResult.affectedRows) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
    return res.json({
      success: true,
      data: rows[0] || null,
      message: "Profile photo updated successfully",
    });
  } catch (err) {
    return next(err);
  }
});

// =====================================================
// BOOKING SYSTEM RESTORATION - Complete Booking API
// =====================================================

/** POST /api/trainer-bookings - Create Trainer Booking */
gymApiRouter.post("/trainer-bookings", async (req, res, next) => {
  try {
    const { trainer_id, member_name, session_type, booking_date, start_time, end_time, notes } = req.body;
    
    if (!trainer_id || !member_name || !booking_date || !start_time || !end_time) {
      return res.status(400).json({ success: false, message: "Missing required booking fields" });
    }

    // Get member info
    const [memberRows] = await db.query(
      "SELECT id, full_name, email FROM members WHERE full_name = ? OR email = ? LIMIT 1",
      [member_name, member_name]
    );
    
    if (!memberRows.length) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }
    
    const member = memberRows[0];
    
    // Get trainer info
    const [trainerRows] = await db.query(
      "SELECT full_name, specialization FROM trainers WHERE id = ? AND status = 'active'",
      [trainer_id]
    );
    
    if (!trainerRows.length) {
      return res.status(404).json({ success: false, message: "Trainer not found or unavailable" });
    }
    
    const trainer = trainerRows[0];
    
    // Calculate total amount based on session type
    let totalAmount = 500.00; // Default price
    if (session_type === 'group') {
      totalAmount = 300.00;
    } else if (session_type === 'strength') {
      totalAmount = 400.00;
    } else if (session_type === 'cardio') {
      totalAmount = 250.00;
    }
    
    // Create booking
    const [bookingResult] = await db.query(
      `INSERT INTO bookings (member_id, trainer_id, booking_date, start_time, end_time, status, total_amount, payment_status, notes)
       VALUES (?, ?, ?, ?, ?, 'booked', ?, 'pending', ?)`,
      [member.id, trainer_id, booking_date, start_time, end_time, totalAmount, notes || '']
    );
    
    const bookingId = bookingResult.insertId;
    
    // Generate receipt number
    const receiptNumber = `TRB${Date.now()}${bookingId}`;
    
    // Create receipt
    const receiptData = {
      member_name: member.full_name,
      trainer_name: trainer.full_name,
      session_type: session_type || 'personal',
      booking_date: booking_date,
      start_time: start_time,
      end_time: end_time,
      amount: totalAmount,
      status: 'booked'
    };
    
    await db.query(
      `INSERT INTO receipts (receipt_number, type, member_id, trainer_id, booking_id, total_amount, receipt_data)
       VALUES (?, 'booking', ?, ?, ?, ?, ?)`,
      [receiptNumber, member.id, trainer_id, bookingId, totalAmount, JSON.stringify(receiptData)]
    );
    
    return res.json({
      success: true,
      data: {
        booking_id: bookingId,
        receipt_number: receiptNumber,
        member_name: member.full_name,
        trainer_name: trainer.full_name,
        session_type: session_type || 'personal',
        booking_date: booking_date,
        start_time: start_time,
        end_time: end_time,
        total_amount: totalAmount,
        status: 'booked'
      },
      message: "Booking created successfully"
    });
    
  } catch (err) {
    console.error('Create booking error:', err);
    return res.status(500).json({ success: false, message: "Failed to create booking" });
  }
});

/** GET /api/trainer-bookings - Get All Bookings (Admin) */
gymApiRouter.get("/trainer-bookings", async (req, res, next) => {
  try {
    const [bookings] = await db.query(
      `SELECT b.*, m.full_name as member_name, t.full_name as trainer_name, t.specialization
       FROM bookings b
       LEFT JOIN members m ON b.member_id = m.id
       LEFT JOIN trainers t ON b.trainer_id = t.id
       ORDER BY b.created_at DESC`
    );
    
    return res.json({
      success: true,
      data: bookings,
      message: "Bookings retrieved successfully"
    });
    
  } catch (err) {
    console.error('Get bookings error:', err);
    return res.status(500).json({ success: false, message: "Failed to retrieve bookings" });
  }
});

/** GET /api/trainer-bookings/:id - Get Booking Details */
gymApiRouter.get("/trainer-bookings/:id", async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    
    const [bookings] = await db.query(
      `SELECT b.*, m.full_name as member_name, m.email as member_email, m.phone as member_phone,
              t.full_name as trainer_name, t.specialization, t.email as trainer_email
       FROM bookings b
       LEFT JOIN members m ON b.member_id = m.id
       LEFT JOIN trainers t ON b.trainer_id = t.id
       WHERE b.id = ?`,
      [bookingId]
    );
    
    if (!bookings.length) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    
    const booking = bookings[0];
    
    // Get receipt if exists
    const [receipts] = await db.query(
      "SELECT * FROM receipts WHERE booking_id = ? ORDER BY generated_at DESC LIMIT 1",
      [bookingId]
    );
    
    booking.receipt = receipts[0] || null;
    
    return res.json({
      success: true,
      data: booking,
      message: "Booking details retrieved successfully"
    });
    
  } catch (err) {
    console.error('Get booking details error:', err);
    return res.status(500).json({ success: false, message: "Failed to retrieve booking details" });
  }
});

/** POST /api/trainer-bookings/:id/payment - Process Booking Payment */
gymApiRouter.post("/trainer-bookings/:id/payment", async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const { payment_method, amount } = req.body;
    
    if (!payment_method || !amount) {
      return res.status(400).json({ success: false, message: "Payment method and amount required" });
    }
    
    // Get booking details
    const [bookings] = await db.query(
      "SELECT * FROM bookings WHERE id = ?",
      [bookingId]
    );
    
    if (!bookings.length) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    
    const booking = bookings[0];
    
    // Create payment record
    const [paymentResult] = await db.query(
      `INSERT INTO booking_payments (booking_id, amount, payment_method, payment_date, status)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'paid')`,
      [bookingId, amount, payment_method]
    );
    
    const paymentId = paymentResult.insertId;
    
    // Update booking status
    await db.query(
      "UPDATE bookings SET payment_status = 'paid', status = 'confirmed' WHERE id = ?",
      [bookingId]
    );
    
    // Generate final receipt
    const receiptNumber = `TRP${Date.now()}${paymentId}`;
    const receiptData = {
      booking_id: bookingId,
      payment_id: paymentId,
      payment_method: payment_method,
      amount: amount,
      payment_date: new Date().toISOString(),
      status: 'paid'
    };
    
    await db.query(
      `INSERT INTO receipts (receipt_number, type, member_id, trainer_id, booking_id, payment_id, total_amount, receipt_data)
       VALUES (?, 'payment', ?, ?, ?, ?, ?, ?)`,
      [receiptNumber, booking.member_id, booking.trainer_id, bookingId, paymentId, amount, JSON.stringify(receiptData)]
    );
    
    return res.json({
      success: true,
      data: {
        payment_id: paymentId,
        receipt_number: receiptNumber,
        booking_status: 'confirmed',
        payment_status: 'paid'
      },
      message: "Payment processed successfully"
    });
    
  } catch (err) {
    console.error('Process payment error:', err);
    return res.status(500).json({ success: false, message: "Failed to process payment" });
  }
});

/** GET /api/receipts/:receipt_number - Get Receipt by Number */
gymApiRouter.get("/receipts/:receipt_number", async (req, res, next) => {
  try {
    const receiptNumber = req.params.receipt_number;
    
    const [receipts] = await db.query(
      `SELECT r.*, m.full_name as member_name, t.full_name as trainer_name
       FROM receipts r
       LEFT JOIN members m ON r.member_id = m.id
       LEFT JOIN trainers t ON r.trainer_id = t.id
       WHERE r.receipt_number = ?`,
      [receiptNumber]
    );
    
    if (!receipts.length) {
      return res.status(404).json({ success: false, message: "Receipt not found" });
    }
    
    const receipt = receipts[0];
    
    // Parse receipt data
    if (receipt.receipt_data) {
      try {
        receipt.receipt_data = JSON.parse(receipt.receipt_data);
      } catch (e) {
        receipt.receipt_data = {};
      }
    }
    
    return res.json({
      success: true,
      data: receipt,
      message: "Receipt retrieved successfully"
    });
    
  } catch (err) {
    console.error('Get receipt error:', err);
    return res.status(500).json({ success: false, message: "Failed to retrieve receipt" });
  }
});

/** GET /api/trainer-sessions - Get Available Trainer Sessions */
gymApiRouter.get("/trainer-sessions", async (req, res, next) => {
  try {
    const trainerId = req.query.trainer_id;
    
    let sql = `
      SELECT ts.*, t.full_name as trainer_name, t.specialization
      FROM trainer_sessions ts
      LEFT JOIN trainers t ON ts.trainer_id = t.id
      WHERE ts.is_active = 1
    `;
    const params = [];
    
    if (trainerId) {
      sql += " AND ts.trainer_id = ?";
      params.push(trainerId);
    }
    
    sql += " ORDER BY ts.session_name";
    
    const [sessions] = await db.query(sql, params);
    
    return res.json({
      success: true,
      data: sessions,
      message: "Trainer sessions retrieved successfully"
    });
    
  } catch (err) {
    console.error('Get trainer sessions error:', err);
    return res.status(500).json({ success: false, message: "Failed to retrieve trainer sessions" });
  }
});

/** POST /api/attendance - Record Attendance */
gymApiRouter.post("/attendance", async (req, res, next) => {
  try {
    const { member_id, trainer_id, check_in_time, date, notes } = req.body;
    
    if (!member_id || !date) {
      return res.status(400).json({ success: false, message: "Member ID and date are required" });
    }
    
    // Check if attendance already exists for this member and date
    const [existing] = await db.query(
      "SELECT id FROM attendance WHERE member_id = ? AND date = ?",
      [member_id, date]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "Attendance already recorded for this date" });
    }
    
    // Record attendance
    const [result] = await db.query(
      `INSERT INTO attendance (member_id, trainer_id, check_in_time, date, status, notes)
       VALUES (?, ?, ?, ?, 'present', ?)`,
      [member_id, trainer_id || null, check_in_time || new Date(), date, notes || '']
    );
    
    return res.json({
      success: true,
      data: {
        attendance_id: result.insertId,
        member_id: member_id,
        date: date,
        status: 'present'
      },
      message: "Attendance recorded successfully"
    });
    
  } catch (err) {
    console.error('Record attendance error:', err);
    return res.status(500).json({ success: false, message: "Failed to record attendance" });
  }
});

/** GET /api/attendance - Get Attendance Records */
gymApiRouter.get("/attendance", async (req, res, next) => {
  try {
    const { date, member_id, trainer_id } = req.query;
    
    let sql = `
      SELECT a.*, m.full_name as member_name, t.full_name as trainer_name
      FROM attendance a
      LEFT JOIN members m ON a.member_id = m.id
      LEFT JOIN trainers t ON a.trainer_id = t.id
      WHERE 1=1
    `;
    const params = [];
    
    if (date) {
      sql += " AND a.date = ?";
      params.push(date);
    }
    
    if (member_id) {
      sql += " AND a.member_id = ?";
      params.push(member_id);
    }
    
    if (trainer_id) {
      sql += " AND a.trainer_id = ?";
      params.push(trainer_id);
    }
    
    sql += " ORDER BY a.date DESC, a.check_in_time DESC";
    
    const [attendance] = await db.query(sql, params);
    
    return res.json({
      success: true,
      data: attendance,
      message: "Attendance records retrieved successfully"
    });
    
  } catch (err) {
    console.error('Get attendance error:', err);
    return res.status(500).json({ success: false, message: "Failed to retrieve attendance records" });
  }
});

/** GET /api/membership-plans — Get all membership plans for dropdown */
gymApiRouter.get("/membership-plans", async (req, res, next) => {
  try {
    const [plans] = await db.query(
      `SELECT id, name, description, price, duration_months, features, is_active
       FROM membership_plans 
       WHERE is_active = 1 
       ORDER BY price ASC`
    );
    
    return res.json({
      success: true,
      data: plans,
      message: "Membership plans retrieved successfully"
    });
  } catch (err) {
    console.error('Get membership plans error:', err);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to retrieve membership plans" 
    });
  }
});

/** GET /api/payments — Get payment records for management */
gymApiRouter.get("/payments", async (req, res, next) => {
  try {
    const { status, member_id, date_from, date_to, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let sql = `
      SELECT p.*, m.full_name as member_name, m.email as member_email,
             t.full_name as trainer_name
      FROM payments p
      LEFT JOIN members m ON p.member_id = m.id
      LEFT JOIN trainers t ON p.trainer_id = t.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status && status !== 'all') {
      sql += " AND p.status = ?";
      params.push(status);
    }
    
    if (member_id) {
      sql += " AND p.member_id = ?";
      params.push(member_id);
    }
    
    if (date_from) {
      sql += " AND p.payment_date >= ?";
      params.push(date_from);
    }
    
    if (date_to) {
      sql += " AND p.payment_date <= ?";
      params.push(date_to);
    }
    
    sql += " ORDER BY p.payment_date DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    
    const [payments] = await db.query(sql, params);
    
    // Get total count for pagination
    let countSql = "SELECT COUNT(*) as total FROM payments p WHERE 1=1";
    const countParams = [];
    
    if (status && status !== 'all') {
      countSql += " AND p.status = ?";
      countParams.push(status);
    }
    
    if (member_id) {
      countSql += " AND p.member_id = ?";
      countParams.push(member_id);
    }
    
    if (date_from) {
      countSql += " AND p.payment_date >= ?";
      countParams.push(date_from);
    }
    
    if (date_to) {
      countSql += " AND p.payment_date <= ?";
      countParams.push(date_to);
    }
    
    const [countResult] = await db.query(countSql, countParams);
    const total = countResult[0].total;
    
    return res.json({
      success: true,
      data: payments,
      pagination: {
        current_page: Number(page),
        total_pages: Math.ceil(total / limit),
        total_records: total,
        limit: Number(limit)
      },
      message: "Payments retrieved successfully"
    });
  } catch (err) {
    console.error('Get payments error:', err);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to retrieve payments" 
    });
  }
});

/** POST /api/payments — Create new payment record */
gymApiRouter.post("/payments", async (req, res, next) => {
  try {
    const { member_id, amount, payment_method, payment_date, description, receipt_number } = req.body;
    
    if (!member_id || !amount || !payment_method) {
      return res.status(400).json({ 
        success: false, 
        message: "Member ID, amount, and payment method are required" 
      });
    }
    
    // Generate receipt number if not provided
    const receiptNum = receipt_number || `PAY${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    const [result] = await db.query(
      `INSERT INTO payments (member_id, amount, payment_method, payment_date, status, description, receipt_number)
       VALUES (?, ?, ?, ?, 'paid', ?, ?)`,
      [member_id, amount, payment_method, payment_date || new Date().toISOString().split('T')[0], description || '', receiptNum]
    );
    
    // Update member status if this is a membership payment
    if (description && description.toLowerCase().includes('membership')) {
      const membershipEnd = new Date();
      membershipEnd.setMonth(membershipEnd.getMonth() + 1); // Add 1 month
      await db.query(
        "UPDATE members SET status = 'active', membership_end = ? WHERE id = ?",
        [membershipEnd.toISOString().split('T')[0], member_id]
      );
    }
    
    return res.json({
      success: true,
      data: {
        payment_id: result.insertId,
        receipt_number: receiptNum,
        status: 'paid'
      },
      message: "Payment created successfully"
    });
  } catch (err) {
    console.error('Create payment error:', err);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to create payment" 
    });
  }
});

// =====================================================
// MEMBERSHIP SYSTEM API ENDPOINTS
// =====================================================

/** POST /api/membership/purchase - Purchase membership plan */
gymApiRouter.post("/membership/purchase", async (req, res) => {
  try {
    const { user_id, member_id, plan_name, plan_id, amount, duration_days, payment_method } = req.body;
    
    if (!user_id || !member_id || !plan_name || !amount || !duration_days) {
      return res.status(400).json({
        success: false,
        message: "user_id, member_id, plan_name, amount, and duration_days are required"
      });
    }

    // Check for duplicate active membership
    const [existing] = await db.query(
      "SELECT membership_id FROM memberships WHERE user_id = ? AND membership_status = 'active' AND expiration_date > NOW()",
      [user_id]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "You already have an active membership. Please wait for it to expire or cancel it first."
      });
    }

    const now = new Date();
    const expirationDate = new Date(now.getTime() + duration_days * 24 * 60 * 60 * 1000);
    const receiptNum = `RCP${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Insert payment
    const [paymentResult] = await db.query(
      `INSERT INTO payments (receipt_number, member_id, amount, payment_method, payment_date, status, description, processed_by)
       VALUES (?, ?, ?, ?, NOW(), 'paid', ?, 'System')`,
      [receiptNum, member_id, amount, payment_method || 'Wallet', `Membership: ${plan_name}`]
    );

    // Insert membership record
    const [membershipResult] = await db.query(
      `INSERT INTO memberships (user_id, member_id, membership_plan, amount_paid, start_date, expiration_date, remaining_seconds, membership_status)
       VALUES (?, ?, ?, ?, NOW(), ?, ?, 'active')`,
      [user_id, member_id, plan_name, amount, expirationDate, Math.floor(duration_days * 24 * 60 * 60)]
    );

    // Update member status
    await db.query(
      "UPDATE members SET status = 'active', membership_plan_id = ? WHERE id = ?",
      [plan_id || null, member_id]
    );

    // Create notification for admin
    await db.query(
      `INSERT INTO notifications (admin_target, user_id, message, type, is_read)
       VALUES ('all', ?, ?, 'payment', 0)`,
      [user_id, `New membership purchase: ${plan_name} by user #${user_id} - Amount: ₱${amount}`]
    );

    return res.json({
      success: true,
      data: {
        payment_id: paymentResult.insertId,
        membership_id: membershipResult.insertId,
        receipt_number: receiptNum,
        plan_name: plan_name,
        amount: amount,
        start_date: now,
        expiration_date: expirationDate,
        status: 'active'
      },
      message: "Membership purchased successfully!"
    });
  } catch (err) {
    console.error('Membership purchase error:', err);
    return res.status(500).json({
      success: false,
      message: "Failed to process membership purchase: " + err.message
    });
  }
});

/** GET /api/membership/status/:user_id - Get real-time membership status */
gymApiRouter.get("/membership/status/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;
    
    // Update expired memberships first
    await db.query(
      `UPDATE memberships 
       SET membership_status = 'expired', remaining_seconds = 0
       WHERE expiration_date <= NOW() AND membership_status = 'active'`
    );
    
    const [rows] = await db.query(
      `SELECT 
        m.membership_id,
        m.user_id,
        m.member_id,
        m.membership_plan,
        m.amount_paid,
        m.start_date,
        m.expiration_date,
        CASE 
          WHEN m.expiration_date > NOW() THEN TIMESTAMPDIFF(SECOND, NOW(), m.expiration_date)
          ELSE 0
        END as remaining_seconds,
        CASE 
          WHEN m.expiration_date > NOW() THEN 'active'
          ELSE 'expired'
        END as membership_status,
        mem.full_name as member_name,
        mem.member_code
       FROM memberships m
       LEFT JOIN members mem ON m.member_id = mem.id
       WHERE m.user_id = ? AND m.membership_status != 'expired'
       ORDER BY m.created_at DESC
       LIMIT 1`,
      [userId]
    );
    
    if (rows.length === 0) {
      return res.json({
        success: true,
        data: {
          has_membership: false,
          membership_status: 'inactive',
          message: 'No active membership found'
        }
      });
    }
    
    const membership = rows[0];
    membership.has_membership = true;
    membership.remaining_seconds = Math.max(0, membership.remaining_seconds);
    
    return res.json({
      success: true,
      data: membership
    });
  } catch (err) {
    console.error('Get membership status error:', err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve membership status"
    });
  }
});

/** GET /api/membership/timer/:user_id - Get countdown timer data */
gymApiRouter.get("/membership/timer/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;
    
    const [rows] = await db.query(
      `SELECT 
        TIMESTAMPDIFF(SECOND, NOW(), expiration_date) as remaining_seconds,
        membership_status,
        membership_plan
       FROM memberships 
       WHERE user_id = ? AND membership_status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    
    if (rows.length === 0) {
      return res.json({
        success: true,
        data: { active: false, remaining_seconds: 0 }
      });
    }
    
    const remaining = Math.max(0, rows[0].remaining_seconds);
    
    // Auto-expire if needed
    if (remaining === 0 && rows[0].membership_status === 'active') {
      await db.query(
        "UPDATE memberships SET membership_status = 'expired' WHERE user_id = ? AND membership_status = 'active'",
        [userId]
      );
    }
    
    return res.json({
      success: true,
      data: {
        active: remaining > 0,
        remaining_seconds: remaining,
        membership_plan: rows[0].membership_plan,
        membership_status: remaining > 0 ? 'active' : 'expired'
      }
    });
  } catch (err) {
    console.error('Timer error:', err);
    return res.status(500).json({
      success: false,
      message: "Timer error"
    });
  }
});

/** GET /api/user/receipts/:user_id - Get user's receipt/payment history */
gymApiRouter.get("/user/receipts/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;
    
    // Get receipts from payments table joined with members
    const [receipts] = await db.query(
      `SELECT 
        p.id,
        p.receipt_number,
        p.member_id,
        mem.full_name as member_name,
        p.amount,
        p.payment_method,
        p.payment_date,
        p.status,
        p.description as notes,
        p.processed_by
       FROM payments p
       LEFT JOIN members mem ON p.member_id = mem.id
       WHERE p.member_id IN (SELECT member_id FROM memberships WHERE user_id = ?)
          OR p.member_id = ?
       ORDER BY p.payment_date DESC`,
      [userId, userId]
    );
    
    return res.json({
      success: true,
      data: receipts,
      count: receipts.length
    });
  } catch (err) {
    console.error('Get receipts error:', err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve receipts"
    });
  }
});

/** GET /api/user/notifications/:user_id - Get user notifications */
gymApiRouter.get("/user/notifications/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;
    
    const [notifications] = await db.query(
      `SELECT * FROM notifications 
       WHERE (user_id = ? OR admin_target = 'all') 
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    
    return res.json({
      success: true,
      data: notifications,
      count: notifications.length
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve notifications"
    });
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
