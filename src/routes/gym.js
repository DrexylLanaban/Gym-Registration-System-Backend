const express = require("express");
const { db } = require("../services/db");

const gymApiRouter = express.Router();

function stripPassword(row) {
  if (!row) return row;
  const { password: _p, ...rest } = row;
  return rest;
}

/** POST /api/login — LoginActivity */
gymApiRouter.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || password === undefined) {
      return res.status(400).json({ success: false, message: "username and password required" });
    }

    const [rows] = await db.query("SELECT * FROM users WHERE username = ? AND password = ?", [
      username,
      password,
    ]);

    if (rows.length > 0) {
      return res.json({ success: true, user: stripPassword(rows[0]) });
    }
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  } catch (err) {
    return next(err);
  }
});

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
 * GET /api/payments — PaymentListActivity
 * Optional query: member_id — when set, only that member’s rows (member view / session member id).
 */
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

/** GET /api/dashboard/stats — MainActivity loadDashboardStats / monthly income (paid), pending count */
gymApiRouter.get("/dashboard/stats", async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT * FROM dashboard_summary");
    const r = rows[0] || {};
    return res.json({
      success: true,
      data: {
        totalMembers: Number(r.total_members ?? 0),
        activeMembers: Number(r.active_members ?? 0),
        todayAttendance: Number(r.today_attendance ?? 0),
        monthlyIncome: Number(r.monthly_income ?? 0),
        totalTrainers: Number(r.total_trainers ?? 0),
        pendingPayments: Number(r.pending_payments ?? 0),
        currency: "PHP",
      },
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
    const [results] = await db.query("SELECT * FROM trainers ORDER BY id");
    return res.json(results);
  } catch (err) {
    return next(err);
  }
});

module.exports = { gymApiRouter };
