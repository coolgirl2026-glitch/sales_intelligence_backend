export function errorHandler(err, req, res, next) {
  console.error("Unexpected error:", err);
  const status = err.status || 500;
  return res.status(status).json({
    error: err.message || "Internal server error. Please try again.",
    model: err.model,
    details: err.details || null,
  });
}
