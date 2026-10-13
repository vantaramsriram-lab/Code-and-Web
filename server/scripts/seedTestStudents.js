import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { connectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { assertSafeSeedTarget } from '../src/utils/seedSafety.js';
import Student from '../src/models/Student.js';
import mongoose from 'mongoose';
const csvPath = resolve(fileURLToPath(new URL('../../test-data/students_test.csv', import.meta.url)));
assertSafeSeedTarget(env.NODE_ENV, env.NODE_ENV === 'test' ? (process.env.TEST_MONGODB_URI || env.MONGODB_URI) : env.MONGODB_URI);
const uri = env.NODE_ENV === 'test' ? (process.env.TEST_MONGODB_URI || env.MONGODB_URI) : env.MONGODB_URI;
try {
  await connectDB(uri);
  const fs = await import('node:fs/promises');
  const rows = parse(await fs.readFile(csvPath), { columns: true, bom: true, skip_empty_lines: true, trim: true });
  for (let i = 0; i < rows.length; i += 250) {
    await Student.bulkWrite(rows.slice(i, i + 250).map((row) => ({ updateOne: { filter: { scholarNumber: row.scholarNumber }, update: { $setOnInsert: { ...row, isActive: true } }, upsert: true } })), { ordered: false });
  }
  console.info(`Seeded or verified ${rows.length} fictional students in ${mongoose.connection.name}. No quiz attempts were created.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
