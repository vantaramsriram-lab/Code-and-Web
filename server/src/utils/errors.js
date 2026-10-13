export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
export function notFound(_req, res) { res.status(404).json({ message: 'Route not found.' }); }
export function errorHandler(err, _req, res, _next) {
  const status = Number(err.status) || 500;
  if (status >= 500) console.error(JSON.stringify({ level: 'error', event: 'request_failed', message: err.message, stack: process.env.NODE_ENV === 'production' ? undefined : err.stack }));
  res.status(status).json({ message: status >= 500 ? 'An unexpected server error occurred.' : err.message, ...(err.details ? { details: err.details } : {}) });
}
