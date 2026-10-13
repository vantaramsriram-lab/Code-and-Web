import http from 'node:http';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { startQuizJobs } from './jobs/quizJobs.js';
import Student from './models/Student.js';
import Admin from './models/Admin.js';
import Quiz from './models/Quiz.js';
import Question from './models/Question.js';
import Attempt from './models/Attempt.js';
const server = http.createServer(createApp());
let stopJobs;
async function shutdown(signal) {
  console.info(JSON.stringify({ level: 'info', event: 'shutdown', signal }));
  stopJobs?.();
  server.close(async () => { await mongoose.disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
try {
  await connectDB();
  await Promise.all([Student, Admin, Quiz, Question, Attempt].map((model) => model.createIndexes()));
  console.info(JSON.stringify({ level: 'info', event: 'database_indexes_ready' }));
  stopJobs = startQuizJobs();
  server.listen(env.PORT, '0.0.0.0', () => console.info(JSON.stringify({ level: 'info', event: 'server_listening', port: env.PORT, environment: env.NODE_ENV })));
} catch (error) { console.error(JSON.stringify({ level: 'error', event: 'startup_failed', message: error.message })); process.exit(1); }
