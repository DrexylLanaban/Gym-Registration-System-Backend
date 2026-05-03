const http = require("http");
const { createApp } = require("./app");

const PORT = Number(process.env.PORT || 3000);

async function main() {
  const app = createApp();
  const server = http.createServer(app);

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      // eslint-disable-next-line no-console
      console.error(
        `Port ${PORT} is already in use. Close the other terminal running this API, or stop the process (Task Manager / netstat), or set a different PORT in .env.`
      );
      process.exit(1);
    }
    throw err;
  });

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});

