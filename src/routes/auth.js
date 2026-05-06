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
  const rawId = base.id;
  const idNum = rawId != null && rawId !== "" ? Number(rawId) : 0;
  
  // Determine role with proper admin detection
  let userRole = "user"; // Default role
  if (base.role) {
    const roleStr = String(base.role).toLowerCase();
    if (roleStr === "admin" || roleStr === "administrator") {
      userRole = "admin";
    } else if (roleStr === "staff" || roleStr === "trainer") {
      userRole = "staff";
    } else {
      userRole = roleStr;
    }
  }
  
  // Special admin detection by email
  if (email === "admin@gym.com" || email === "administrator@gym.com") {
    userRole = "admin";
  }
  
  return {
    id: Number.isFinite(idNum) ? idNum : 0,
    memberId: (() => {
      if (base.member_id == null || base.member_id === "") return null;
      const n = Number(base.member_id);
      return Number.isFinite(n) ? n : null;
    })(),
    name: base.name != null ? String(base.name) : "",
    email,
    role: userRole,
    phone: base.phone != null ? String(base.phone) : "",
    profilePhoto,
    token,
    isAdmin: userRole === "admin",
    permissions: {
      canManageMembers: userRole === "admin",
      canManageTrainers: userRole === "admin",
      canManagePayments: userRole === "admin",
      canManageAttendance: userRole === "admin",
      canViewReports: userRole === "admin",
      canBookSessions: true, // All users can book sessions
      canViewProfile: true, // All users can view profile
      canManageBookings: userRole === "admin"
    }
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

    let rows;
    try {
      // Prefer username OR normalized email match (users.email may be missing on legacy DBs)
      [rows] = await db.query(
        `SELECT u.*
         FROM users u
         WHERE (u.username = ? OR LOWER(TRIM(COALESCE(u.email, ''))) = ?) AND u.password = ?`,
        [identifier, identifier, passwordStr]
      );
    } catch (err) {
      if (err.code === "ER_BAD_FIELD_ERROR") {
        [rows] = await db.query(
          "SELECT u.* FROM users u WHERE u.username = ? AND u.password = ?",
          [identifier, passwordStr]
        );
      } else {
        throw err;
      }
    }

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    return res.json(authSuccessBody(rows[0]));
  } catch (err) {
    if (err.code === "ER_BAD_FIELD_ERROR") {
      return res.status(500).json({
        success: false,
        message:
          "Database schema mismatch (e.g. missing users.email). Apply sql/migration_gym_dashboard_v2.sql or align the users table with the backend.",
      });
    }
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

    // Primary flow: project schema (members + users with member_id)
    // Fallback flow: simple cloud schema with users(name, email, password, phone, role)
    try {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        // 1. Create member record first with 5 PHP balance
        const [mResult] = await conn.query(
          "INSERT INTO members (full_name, phone, email, balance, current_status) VALUES (?, ?, ?, ?, ?)",
          [nameStr, phoneStr, emailNorm, 5.00, 'inactive']
        );
        const memberId = mResult.insertId;
        const [uResult] = await conn.query(
          "INSERT INTO users (member_id, username, password, email, name, phone, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [memberId, username, passwordStr, emailNorm, nameStr, phoneStr, roleStr]
        );
        await conn.commit();

        const userId = uResult.insertId;
        const [rows] = await conn.query("SELECT * FROM users u WHERE u.id = ?", [userId]);
        return res.status(201).json({
          ...authSuccessBody(rows[0]),
          message: "Registration successful",
          total: 1,
        });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      if (err.code !== "ER_BAD_FIELD_ERROR" && err.code !== "ER_NO_SUCH_TABLE") {
        throw err;
      }

      // Fallback: cloud MySQL with users-only table
      const [insertResult] = await db.query(
        "INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)",
        [nameStr, emailNorm, passwordStr, phoneStr, roleStr || "member"]
      );
      const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [insertResult.insertId]);
      return res.status(201).json({
        ...authSuccessBody(rows[0]),
        message: "User registered successfully!",
        total: 1,
      });
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
        message: `Database Error: ${err.message}`,
      });
    }
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(500).json({
        success: false,
        message: `Database Error: ${err.message}`,
      });
    }
    return res.status(500).json({
      success: false,
      message: `Database Error: ${err.message || "Unknown database error"}`,
      data: null,
      total: 0,
    });
  }
}

authRouter.post("/register", handleAuthRegister);

module.exports = { authRouter, handleAuthLogin, handleAuthRegister };
