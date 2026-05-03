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
  return {
    id: base.id,
    name: base.name != null ? String(base.name) : "",
    email,
    role: base.role != null ? String(base.role) : "staff",
    phone: base.phone != null ? String(base.phone) : "",
    profilePhoto:
      base.profile_photo != null
        ? String(base.profile_photo)
        : base.profilePhoto != null
          ? String(base.profilePhoto)
          : "",
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

/** POST /api/auth/login — Android LoginActivity (JSON uses email + password) */
authRouter.post("/login", async (req, res, next) => {
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
      "SELECT * FROM users WHERE (username = ? OR LOWER(TRIM(email)) = ?) AND password = ?",
      [identifier, identifier, passwordStr]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    return res.json(authSuccessBody(rows[0]));
  } catch (err) {
    return next(err);
  }
});

/** POST /api/auth/register — Android RegisterActivity */
authRouter.post("/register", async (req, res, next) => {
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

    const [result] = await db.query(
      "INSERT INTO users (username, password, email, name, phone, role) VALUES (?, ?, ?, ?, ?, ?)",
      [username, passwordStr, emailNorm, nameStr, phoneStr, roleStr]
    );

    const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [result.insertId]);
    return res.status(201).json({
      ...authSuccessBody(rows[0]),
      message: "Registration successful",
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }
    if (err.code === "ER_BAD_FIELD_ERROR") {
      return res.status(500).json({
        success: false,
        message:
          "Database is missing columns for registration. Run sql/alter_users_register.sql on gym_db.",
      });
    }
    return next(err);
  }
});

module.exports = { authRouter };
