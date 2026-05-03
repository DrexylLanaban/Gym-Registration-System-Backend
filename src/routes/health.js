const express = require("express");
const { db } = require("../services/db");

const healthRouter = express.Router();

healthRouter.get("/", async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows?.[0]?.ok === 1 });
  } catch (err) {
    next(err);
  }
});

module.exports = { healthRouter };
