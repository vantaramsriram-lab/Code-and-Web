import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import Admin from '../models/Admin.js';
import Student from '../models/Student.js';
import { issueSession, clearSession } from '../utils/auth.js';
import { HttpError } from '../utils/errors.js';
import { normalizeScholarNumber } from '../utils/normalize.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
const adminLoginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many admin login attempts. Try again later.' } });
const studentGlobalLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many student entry requests. Try again later.' } });
const studentScholarLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${normalizeScholarNumber(req.body?.scholarNumber).slice(0, 40)}`, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many attempts for this scholar number. Try again later.' } });
router.post('/admin/login', adminLoginLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (email.length > 254 || password.length > 200) throw new HttpError(400, 'Enter a valid email and password.');
  const admin = await Admin.findOne({ email }).select('+passwordHash');
  const ok = admin && await bcrypt.compare(password, admin.passwordHash);
  if (!ok) throw new HttpError(401, 'Invalid email or password.');
  issueSession(res, { sub: String(admin._id), role: 'admin' });
  res.json({ admin: { email: admin.email, role: admin.role } });
});
router.post('/student/entry', studentGlobalLimit, studentScholarLimit, async (req, res) => {
  const scholarNumber = normalizeScholarNumber(req.body?.scholarNumber);
  if (!scholarNumber || scholarNumber.length > 40) throw new HttpError(400, 'Enter a valid scholar number.');
  const student = await Student.findOne({ scholarNumber, isActive: true }).select('_id name scholarNumber');
  if (!student) throw new HttpError(401, 'We could not verify an active student with that scholar number.');
  issueSession(res, { sub: String(student._id), role: 'student' });
  res.json({ student: { id: String(student._id), name: student.name, scholarNumber: student.scholarNumber } });
});
router.get('/session', requireAuth, async (req, res) => {
  if (req.auth.role === 'admin') {
    const admin = await Admin.findById(req.auth.id).select('email role').lean();
    if (!admin) throw new HttpError(401, 'Session expired.');
    return res.json({ role: 'admin', admin });
  }
  const student = await Student.findById(req.auth.id).select('name scholarNumber').lean();
  if (!student) throw new HttpError(401, 'Session expired.');
  res.json({ role: 'student', student: { id: String(req.auth.id), ...student } });
});
router.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });
export default router;
