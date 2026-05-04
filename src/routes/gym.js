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
  return {
    ...row,
    first_name: firstName,
    last_name: lastName,
    description: row.description != null ? String(row.description) : "",
    status: row.status != null ? String(row.status) : "active",
    member_count: row.member_count != null ? Number(row.member_count) : 0,
    image_url: row.image_url != null ? String(row.image_url) : row.profile_photo ?? "",
  };
}

/** POST /api/login — ApiService: api/login (email or username + password, ApiResponse shape) */
gymApiRouter.post("/login", handleAuthLogin);

/** POST /api/register — ApiService: api/register */
gymApiRouter.post("/register", handleAuthRegister);

/** GET /api/members — MemberListActivity */
gymApiRouter.get("/members", async (req, res, next) => {
  try {
    const [results] = await db.query("SELECT * FROM members ORDER BY id");
    return res.json(results);
  } catch (err) {
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
    // Live admin stats:
    // - pending: member users without any paid payment yet
    // - total members: member users with at least one paid payment
    // This matches the app flow where a newly registered user is pending until first payment.
    const [rows] = await db.query(
      `SELECT
         (
           SELECT COUNT(*)
           FROM users u
           WHERE u.role = 'member'
             AND EXISTS (
               SELECT 1
               FROM payments p
               WHERE p.member_id = u.member_id
                 AND p.status = 'paid'
             )
         ) AS total_members,
         (
           SELECT COUNT(*)
           FROM users u
           JOIN members m ON m.id = u.member_id
           WHERE u.role = 'member'
             AND m.status = 'active'
             AND EXISTS (
               SELECT 1
               FROM payments p
               WHERE p.member_id = u.member_id
                 AND p.status = 'paid'
             )
         ) AS active_members,
         (
           SELECT COUNT(*)
           FROM users u
           JOIN members m ON m.id = u.member_id
           WHERE u.role = 'member'
             AND m.status = 'inactive'
             AND EXISTS (
               SELECT 1
               FROM payments p
               WHERE p.member_id = u.member_id
                 AND p.status = 'paid'
             )
         ) AS inactive_members,
         (
           SELECT COUNT(*)
           FROM users u
           JOIN members m ON m.id = u.member_id
           WHERE u.role = 'member'
             AND m.status = 'expired'
             AND EXISTS (
               SELECT 1
               FROM payments p
               WHERE p.member_id = u.member_id
                 AND p.status = 'paid'
             )
         ) AS expired_members,
         (
           SELECT COUNT(*)
           FROM attendance a
           WHERE DATE(a.check_in) = CURDATE()
         ) AS today_attendance,
         (
           SELECT COALESCE(SUM(p.amount), 0)
           FROM payments p
           WHERE p.status = 'paid'
             AND MONTH(p.payment_date) = MONTH(CURDATE())
             AND YEAR(p.payment_date) = YEAR(CURDATE())
         ) AS monthly_income,
         (
           SELECT COUNT(DISTINCT TRIM(t.full_name))
           FROM trainers
           WHERE TRIM(COALESCE(t.full_name, '')) <> ''
         ) AS total_trainers,
         (
           SELECT COUNT(*)
           FROM users u
           WHERE u.role = 'member'
             AND NOT EXISTS (
               SELECT 1
               FROM payments p
               WHERE p.member_id = u.member_id
                 AND p.status = 'paid'
             )
         ) AS pending_payments,
         (
           SELECT COUNT(*)
           FROM users u
           WHERE u.role = 'member'
             AND EXISTS (
               SELECT 1
               FROM payments p
               WHERE p.member_id = u.member_id
                 AND p.status = 'paid'
                 AND MONTH(p.payment_date) = MONTH(CURDATE())
                 AND YEAR(p.payment_date) = YEAR(CURDATE())
             )
         ) AS new_members_this_month`
    );
    const r = rows[0] || {};
    return res.json({
      success: true,
      data: {
        totalMembers: Number(r.total_members ?? 0),
        activeMembers: Number(r.active_members ?? 0),
        inactiveMembers: Number(r.inactive_members ?? 0),
        expiredMembers: Number(r.expired_members ?? 0),
        todayAttendance: Number(r.today_attendance ?? 0),
        monthlyIncome: Number(r.monthly_income ?? 0),
        totalTrainers: Number(r.total_trainers ?? 0),
        pendingPayments: Number(r.pending_payments ?? 0),
        newMembersThisMonth: Number(r.new_members_this_month ?? 0),
        currency: "PHP",
      },
    });
  } catch (err) {
    return next(err);
  }
}

gymApiRouter.get("/dashboard/stats", getDashboardStats);
gymApiRouter.get("/dashboard_stats", getDashboardStats);

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
