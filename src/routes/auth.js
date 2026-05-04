const crypto = require("crypto");
const express = require("express");
const { db } = require("../services/db");

const authRouter = express.Router();

function stripPassword(row) {
  if (!row) return row;
  const { password: _p, ...rest } = row;
  return rest;
}

function newSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}


function userPayloadForApp(userRow, token) {
  const base = stripPassword(userRow);
  const email =
    base.email != null && String(base.email).trim() !== ""
      ? String(base.email).trim()
      : base.username != null
        ? String(base.username).trim()
        : "";
  const profileFromUser =
    base.profile_photo != null
      ? String(base.profile_photo)
      : base.profilePhoto != null
        ? String(base.profilePhoto)
        : "";
  const profileFromMember =
    base.member_profile_image != null ? String(base.member_profile_image) : "";
  const profilePhoto = profileFromUser || profileFromMember || "";
  return {
    id: Number(base.id),
    memberId: base.member_id != null ? Number(base.member_id) : null,
    name: base.name != null ? String(base.name) : "",
    email,
    role: base.role != null ? String(base.role) : "staff",
    phone: base.phone != null ? String(base.phone) : "",
    profilePhoto,
    token,
  };
}

function authSuccessBody(userRow) {
  const token = newSessionToken();
  return {
    success: true,
    token,
    data: userPayloadForApp(userRow, token),
  };
}

function normalizeLoginIdentifier(body) {
  const { email, username } = body || {};
  if (email != null && String(email).trim()) {
    return String(email).trim().toLowerCase();
  }
  if (username != null && String(username).trim()) {
    return String(username).trim().toLowerCase();
  }
  return "";
}

/** POST /api/auth/login — also mounted at /login and /login.php for legacy Retrofit paths */
async function handleAuthLogin(req, res, next) {
  try {
    const { password } = req.body || {};
    const identifier = normalizeLoginIdentifier(req.body);
    if (!identifier) {
      return res.status(400).json({ success: false, message: "email or username required" });
    }
    if (password === undefined || password === null) {
      return res.status(400).json({ success: false, message: "password required" });
    }
    const passwordStr = String(password);

    const [rows] = await db.query(
      `SELECT u.*, m.profile_image AS member_profile_image
       FROM users u
       LEFT JOIN members m ON m.id = u.member_id
       WHERE (u.username = ? OR LOWER(TRIM(u.email)) = ?) AND u.password = ?`,
      [identifier, identifier, passwordStr]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    return res.json(authSuccessBody(rows[0]));
  } catch (err) {
    return next(err);
  }
}

authRouter.post("/login", handleAuthLogin);

/** POST /api/auth/register — also mounted at /register and /register.php */
async function handleAuthRegister(req, res, next) {
  try {
    const { email, password, name, phone, role } = req.body || {};
    const emailNorm = email != null ? String(email).trim().toLowerCase() : "";
    if (!emailNorm) {
      return res.status(400).json({ success: false, message: "email required" });
    }
    if (password === undefined || password === null || String(password).length < 6) {
      return res
        .status(400)
        .json({ success: false, message: "password required (min 6 characters)" });
    }
    const nameStr = name != null ? String(name).trim() : "";
    if (!nameStr) {
      return res.status(400).json({ success: false, message: "name required" });
    }
    const passwordStr = String(password);
    const phoneStr = phone != null && String(phone).trim() ? String(phone).trim() : null;
    const roleStr =
      role != null && String(role).trim() ? String(role).trim().toLowerCase() : "staff";

    const username = emailNorm;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [mResult] = await conn.query(
        "INSERT INTO members (full_name, phone, email, status) VALUES (?, ?, ?, ?)",
        [nameStr, phoneStr, emailNorm, "active"]
      );
      const memberId = mResult.insertId;
      const [uResult] = await conn.query(
        "INSERT INTO users (member_id, username, password, email, name, phone, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [memberId, username, passwordStr, emailNorm, nameStr, phoneStr, roleStr]
      );
      await conn.commit();

      const userId = uResult.insertId;
      const [rows] = await conn.query(
        `SELECT u.*, m.profile_image AS member_profile_image
         FROM users u
         LEFT JOIN members m ON m.id = u.member_id
         WHERE u.id = ?`,
        [userId]
      );
      return res.status(201).json({
        ...authSuccessBody(rows[0]),
        message: "Registration successful",
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    // HTTP 200 so Retrofit treats this as successful and RegisterActivity can read
    // apiResponse.getMessage() (4xx would skip body parsing in typical setups).
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(200).json({
        success: false,
        message: "Email already registered",
        data: null,
      });
    }
    if (err.code === "ER_BAD_FIELD_ERROR") {
      return res.status(500).json({
        success: false,
        message:
          "Database schema is outdated. Run sql/migration_gym_dashboard_v2.sql (and sql/alter_users_register.sql if needed).",
      });
    }
    return next(err);
  }
}

authRouter.post("/register", handleAuthRegister);

module.exports = { authRouter, handleAuthLogin, handleAuthRegister };
