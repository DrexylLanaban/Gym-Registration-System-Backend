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
  
  // Handle profile photo - prioritize base64 data URLs
  let profilePhoto = "";
  if (row.profile_photo && row.profile_photo.startsWith && row.profile_photo.startsWith('data:')) {
    profilePhoto = row.profile_photo;
  } else if (row.image_url && row.image_url.startsWith && row.image_url.startsWith('data:')) {
    profilePhoto = row.image_url;
  } else if (row.profile_photo) {
    profilePhoto = row.profile_photo;
  } else if (row.image_url) {
    profilePhoto = row.image_url;
  }
  
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

/** GET /api/members — MemberListActivity */
gymApiRouter.get("/members", async (req, res, next) => {
  try {
    const search = req.query.search != null ? String(req.query.search).trim() : "";
    const status = req.query.status != null ? String(req.query.status).trim() : "";
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 100;
    const offset = (page - 1) * limit;

    // Very simple query that will definitely work
    let sql = "SELECT * FROM members";
    const params = [];

    if (search) {
      sql += " WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ?";
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [results] = await db.query(sql, params);

    // Simple count query
    let countSql = "SELECT COUNT(*) as total FROM members";
    const countParams = [];
    
    if (search) {
      countSql += " WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ?";
      const q = `%${search}%`;
      countParams.push(q, q, q);
    }

    const [countResult] = await db.query(countSql, countParams);
    const total = countResult[0].total;

    return res.json({
      success: true,
      data: results.map(member => ({
        id: member.id,
        full_name: member.full_name || "",
        phone: member.phone || "",
        email: member.email || "",
        status: "inactive", // All members start as inactive
        membership_end: null,
        registration_date: member.registration_date,
        profile_photo: member.profile_photo || "",
        current_plan: "No Plan",
        remaining_days: 0,
        created_at: member.created_at,
        updated_at: member.updated_at
      })),
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

    // Simplified query that works with current database
    const [rows] = await db.query(`
      SELECT 
        m.*,
        u.role,
        u.profile_photo,
        'inactive' as membership_status,
        'No Plan' as current_plan,
        NULL as expiration_date
      FROM members m
      LEFT JOIN users u ON u.member_id = m.id
      WHERE m.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const member = rows[0];
    
    // Don't return membership info for admin users
    if (member.role === 'admin') {
      member.membership_status = null;
      member.current_plan = null;
      member.expiration_date = null;
    }

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
    const { full_name, phone, email } = req.body || {};
    const [result] = await db.query(
      "INSERT INTO members (full_name, phone, email) VALUES (?, ?, ?)",
      [full_name, phone, email]
    );
    return res.json({ id: result.insertId, message: "Member added" });
  } catch (err) {
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
  } catch (err) {
    return next(err);
  }
});

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
gymApiRouter.get("/dashboard_stats", getDashboardStats);

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

module.exports = { gymApiRouter };
