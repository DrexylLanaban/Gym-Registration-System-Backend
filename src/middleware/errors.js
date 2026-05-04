function notFoundHandler(req, res) {
  res.status(404).json({
    error: "Not Found",
    success: false,
    message: "Not Found",
  });
}

function errorHandler(err, req, res, next) {
  console.error(err);

  const status = Number(err.status || 500);
  const publicMsg = status >= 500 ? "Internal Server Error" : String(err.message || "Error");

  res.status(status).json({
    error: publicMsg,
    success: false,
    message: publicMsg,
  });
}

module.exports = { notFoundHandler, errorHandler };

