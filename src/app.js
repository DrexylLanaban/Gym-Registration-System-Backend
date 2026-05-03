const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const { registerRoutes } = require("./routes");
const { notFoundHandler, errorHandler } = require("./middleware/errors");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(bodyParser.json({ limit: "1mb" }));

  registerRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };