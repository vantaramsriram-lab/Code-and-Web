import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { checkOrigin } from './middleware/security.js';
import authRoutes from './routes/auth.js';
import studentRoutes from './routes/student.js';
import adminRoutes from './routes/admin.js';
import { errorHandler, notFound } from './utils/errors.js';
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' }, contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"] } } }));
  app.use(cors({ origin: env.CLIENT_URL, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
  app.use(checkOrigin);
  app.use(express.json({ limit: '100kb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(cookieParser());
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  app.use('/api', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', studentRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
