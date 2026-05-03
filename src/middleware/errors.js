function notFoundHandler(req, res) {
  res.status(404).json({ error: "Not Found" });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(err);

  const status = Number(err.status || 500);
  const message = status >= 500 ? "Internal Server Error" : String(err.message || "Error");

  res.status(status).json({ error: message });
}

module.exports = { notFoundHandler, errorHandler };

