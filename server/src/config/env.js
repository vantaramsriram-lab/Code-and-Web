import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), override: false });
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  COOKIE_SECURE: z.string().optional(),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(8),
  QUIZ_EXPIRY_POLL_MS: z.coerce.number().default(15000),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  TEST_MONGODB_URI: z.string().optional()
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  process.exit(1);
}
export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
