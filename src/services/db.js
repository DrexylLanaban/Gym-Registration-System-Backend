const mysql = require("mysql2/promise");
require("dotenv").config();

function parseHostAndPort(hostValue) {
  if (!hostValue) return { host: "localhost", portFromHost: undefined };
  const raw = String(hostValue).trim();
  // Support "host:port" values (common copy/paste from cloud dashboards).
  if (!raw.startsWith("[") && raw.includes(":")) {
    const parts = raw.split(":");
    if (parts.length === 2 && parts[0] && parts[1]) {
      const maybePort = Number(parts[1]);
      if (Number.isFinite(maybePort)) {
        return { host: parts[0], portFromHost: maybePort };
      }
    }
  }
  return { host: raw, portFromHost: undefined };
}

const hostInput = process.env.DB_HOST || process.env.MYSQLHOST || "localhost";
const { host: resolvedHost, portFromHost } = parseHostAndPort(hostInput);
const resolvedPort = Number(
  process.env.DB_PORT || process.env.MYSQLPORT || portFromHost || 3306
);
const resolvedUser = process.env.DB_USER || process.env.MYSQLUSER || "root";
const resolvedPassword = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "";
const resolvedDatabase = process.env.DB_NAME || process.env.MYSQLDATABASE || "";
const resolvedSsl =
  process.env.DB_SSL === "true" || process.env.MYSQL_SSL === "true"
    ? { rejectUnauthorized: false }
    : undefined;

const db = mysql.createPool({
  host: resolvedHost,
  port: resolvedPort,
  user: resolvedUser,
  password: resolvedPassword,
  database: resolvedDatabase,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 20000),
  ssl: resolvedSsl,
  // Avoid BigInt in row objects (breaks JSON.stringify / res.json on some paths)
  supportBigNumbers: true,
  bigNumberStrings: true,
  decimalNumbers: true,
});

console.log(
  `[DB] host=${resolvedHost} port=${resolvedPort} user_set=${Boolean(
    resolvedUser
  )} db_set=${Boolean(resolvedDatabase)} ssl=${Boolean(resolvedSsl)}`
);

module.exports = { db };
