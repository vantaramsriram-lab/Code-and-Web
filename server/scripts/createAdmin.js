import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import Admin from '../src/models/Admin.js';
if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in the private environment before running this command.');
if (env.ADMIN_PASSWORD.length < 14) throw new Error('ADMIN_PASSWORD must be at least 14 characters.');
if (env.NODE_ENV === 'production' && process.env.CONFIRM_ADMIN_CREATE !== 'true') throw new Error('For production, set CONFIRM_ADMIN_CREATE=true for this one-time administrative command.');
try {
  await connectDB();
  const email = env.ADMIN_EMAIL.toLowerCase();
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  await Admin.findOneAndUpdate({ email }, { $set: { passwordHash, role: 'admin' } }, { upsert: true, new: true, runValidators: true });
  console.info(`Admin account created or rotated for ${email}.`);
} finally { await mongoose.disconnect(); }
