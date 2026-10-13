import jwt from 'jsonwebtoken';
import { env, isProduction } from '../config/env.js';
export const COOKIE_NAME = 'spark_session';
export function issueSession(res, payload) {
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: payload.role === 'admin' ? '8h' : '8h', issuer: 'spark-quiz', audience: 'spark-quiz-client' });
  res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: isProduction || env.COOKIE_SECURE === 'true', sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60 * 1000 });
}
export function clearSession(res) { res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction || env.COOKIE_SECURE === 'true', sameSite: 'strict', path: '/' }); }
export function verifySession(token) { return jwt.verify(token, env.JWT_SECRET, { issuer: 'spark-quiz', audience: 'spark-quiz-client' }); }
