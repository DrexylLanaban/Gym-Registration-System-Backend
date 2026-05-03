const { healthRouter } = require("./health");
const { gymApiRouter } = require("./gym");
const { authRouter } = require("./auth");

function registerRoutes(app) {
  app.get("/", (req, res) => {
    res.json({ name: "ipt-final-project-backend", status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", gymApiRouter);
  app.use("/health", healthRouter);
}

module.exports = { registerRoutes };

