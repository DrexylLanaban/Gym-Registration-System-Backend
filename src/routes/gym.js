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
    const [results] = await db.query("SELECT * FROM members");
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

/** GET /api/payments — PaymentListActivity */
gymApiRouter.get("/payments", async (req, res, next) => {
  try {
    const [results] = await db.query(
      `SELECT payments.*, members.full_name
       FROM payments
       JOIN members ON payments.member_id = members.id`
    );
    return res.json(results);
  } catch (err) {
    return next(err);
  }
});

/** GET /api/trainers — TrainerListActivity */
gymApiRouter.get("/trainers", async (req, res, next) => {
  try {
    const [results] = await db.query("SELECT * FROM trainers");
    return res.json(results);
  } catch (err) {
    return next(err);
  }
});

module.exports = { gymApiRouter };
