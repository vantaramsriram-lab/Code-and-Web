import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Student from '../src/models/Student.js';
import Admin from '../src/models/Admin.js';
import Quiz from '../src/models/Quiz.js';
import Question from '../src/models/Question.js';
import Attempt from '../src/models/Attempt.js';
try {
  await connectDB();
  for (const model of [Student, Admin, Quiz, Question, Attempt]) await model.createIndexes();
  console.info('All declared Spark Quiz indexes are present. No existing indexes were dropped.');
} finally { await mongoose.disconnect(); }
