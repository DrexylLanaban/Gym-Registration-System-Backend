const express = require("express");
const multer = require("multer");
const { db } = require("../services/db");
const { handleAuthLogin, handleAuthRegister } = require("./auth");

const gymApiRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
    const [rows] = await db.query("SELECT * FROM dashboard_summary");
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
    const [results] = await db.query("SELECT * FROM trainers ORDER BY id");
    return res.json(results);
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
    return res.json({ success: true, data: rows[0] });
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
    return res.status(201).json({ success: true, data: rows[0], message: "Trainer added successfully" });
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
    return res.json({ success: true, data: rows[0], message: "Trainer updated successfully" });
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
    return res.json({ success: true, data: rows[0], message: "Trainer photo uploaded successfully" });
  } catch (err) {
    return next(err);
  }
});

module.exports = { gymApiRouter };
