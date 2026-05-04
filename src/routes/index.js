const { healthRouter } = require("./health");
const { gymApiRouter } = require("./gym");
const { authRouter, handleAuthLogin, handleAuthRegister } = require("./auth");

function registerRoutes(app) {
  app.get("/", (req, res) => {
    res.json({ name: "ipt-final-project-backend", status: "ok" });
  });

  // Legacy / flat paths when Retrofit baseUrl is https://host/ + login.php | login | register
  app.post("/login", handleAuthLogin);
  app.post("/login.php", handleAuthLogin);
  app.post("/register", handleAuthRegister);
  app.post("/register.php", handleAuthRegister);

  app.use("/api/auth", authRouter);
  app.use("/api", gymApiRouter);
  app.use("/health", healthRouter);
}

module.exports = { registerRoutes };

