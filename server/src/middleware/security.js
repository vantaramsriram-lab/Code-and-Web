import { env } from '../config/env.js';
import { HttpError } from '../utils/errors.js';
export function checkOrigin(req, _res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin && origin !== env.CLIENT_URL) return next(new HttpError(403, 'Request origin is not allowed(testing).'));
  }
  next();
}
