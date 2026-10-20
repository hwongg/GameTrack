function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada.' });
}

function errorHandler(err, req, res, next) {
  console.error(JSON.stringify({ level: 'error', message: err.message, path: req.path, time: new Date().toISOString() }));
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Error interno del servidor.' });
}

module.exports = { notFound, errorHandler };
