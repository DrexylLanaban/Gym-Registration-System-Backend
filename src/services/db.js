const mysql = require("mysql2/promise");
require("dotenv").config();

/**
 * InfinityFree / remote MySQL: set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT.
 * API can run on Render while MySQL stays on InfinityFree — put the same vars in Render → Environment.
 */
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  // Set DB_SSL=true if your provider requires TLS (InfinityFree usually does not)
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

module.exports = { db };
