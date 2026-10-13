import Student from '../models/Student.js';
import Admin from '../models/Admin.js';
import { verifySession, COOKIE_NAME } from '../utils/auth.js';
import { HttpError } from '../utils/errors.js';
export async function requireAuth(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) throw new HttpError(401, 'Please sign in to continue.');
    const claims = verifySession(token);
    if (!['student', 'admin'].includes(claims.role) || !claims.sub) throw new HttpError(401, 'Session is invalid.');
    req.auth = { id: claims.sub, role: claims.role };
    if (claims.role === 'student') {
      const student = await Student.findById(claims.sub).select('_id isActive').lean();
      if (!student?.isActive) throw new HttpError(401, 'This student account is inactive.');
    } else if (!await Admin.exists({ _id: claims.sub })) {
      throw new HttpError(401, 'Admin account is no longer active.');
    }
    next();
  } catch (error) { next(error instanceof HttpError ? error : new HttpError(401, 'Session expired. Please sign in again.')); }
}
export function requireRole(role) { return (req, _res, next) => req.auth?.role === role ? next() : next(new HttpError(403, 'You do not have permission to access this resource.')); }
