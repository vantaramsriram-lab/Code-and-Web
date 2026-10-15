import { Router } from 'express';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import { stringify } from 'csv-stringify/sync';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import { normalizeScholarNumber, escapeCsvCell } from '../utils/normalize.js';
import { studentSchema, questionSchema, settingsSchema } from '../validators/schemas.js';
import Student from '../models/Student.js';
import Quiz from '../models/Quiz.js';
import Question from '../models/Question.js';
import Attempt from '../models/Attempt.js';
import { currentQuiz } from '../services/currentQuiz.js';
import { parseStudentCsv, validateRows, makeFailureCsv } from '../services/csvImport.js';
import { getQuizState } from '../services/quizState.js';
import { finalizeExpiredAttempts } from '../services/attempts.js';
const router = Router();
router.use(requireAuth, requireRole('admin'));
const objectId = (id) => mongoose.isValidObjectId(id);
function checked(schema, data) { const parsed = schema.safeParse(data); if (!parsed.success) throw new HttpError(400, 'Please check the submitted fields.', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))); return parsed.data; }
function escapeRegex(text) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function pageParams(query, exportMode = false) { const page = Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1)); const cap = exportMode ? 250000 : 100; const limit = Math.max(1, Math.min(cap, Number.parseInt(query.limit, 10) || 20)); return { page, limit, skip: (page - 1) * limit }; }
function statusLabel(status) { return ({ submitted: 'submitted', auto_submitted: 'auto_submitted', expired: 'expired', in_progress: 'in_progress' })[status] || status; }
async function resultRows(quiz, query, includeAll = false) {
  const { page, limit, skip } = pageParams(query, includeAll);
  const match = { quizId: quiz._id };
  if (query.status && ['in_progress', 'submitted', 'auto_submitted', 'expired'].includes(query.status)) match.status = query.status;
  if (query.search) {
    const pattern = new RegExp(escapeRegex(String(query.search).slice(0, 100)), 'i');
    const matches = await Student.find({ $or: [{ name: pattern }, { scholarNumber: pattern }] }).select('_id').limit(10000).lean();
    match.studentId = { $in: matches.map((s) => s._id) };
  }
  const dir = query.sort === 'score_asc' ? 1 : -1;
  const sort = query.sort === 'name' ? { 'student.name': 1, 'student.scholarNumber': 1, _id: 1 } : { score: dir, submittedAt: 1, _id: 1 };
  const [facet] = await Attempt.aggregate([
    { $match: match },
    { $lookup: { from: 'students', localField: 'studentId', foreignField: '_id', as: 'student' } },
    { $unwind: '$student' },
    { $sort: sort },
    { $facet: { data: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'value' }] } }
  ]);
  const attempts = facet?.data || [];
  const total = facet?.total?.[0]?.value || 0;
  return { rows: attempts.map((a) => ({ id: String(a._id), studentName: a.student.name, scholarNumber: a.student.scholarNumber, correctAnswers: a.score, totalQuestions: a.totalQuestions, percentage: a.score == null || !a.totalQuestions ? null : Math.round(a.score / a.totalQuestions * 10000) / 100, status: statusLabel(a.status), submittedAt: a.submittedAt, startedAt: a.startedAt })), page, limit, total, pages: Math.ceil(total / limit) };
}
async function resultStats(quiz) {
  const totalStudents = await Student.countDocuments({});
  const attemptedIds = await Attempt.distinct('studentId', { quizId: quiz._id });
  const final = await Attempt.aggregate([{ $match: { quizId: quiz._id, status: { $in: ['submitted', 'auto_submitted', 'expired'] }, score: { $ne: null } } }, { $group: { _id: null, attempts: { $sum: 1 }, averageScore: { $avg: '$score' }, highestScore: { $max: '$score' }, lowestScore: { $min: '$score' } } }]);
  const stat = final[0] || { attempts: 0, averageScore: 0, highestScore: null, lowestScore: null };
  return { totalRegisteredStudents: totalStudents, studentsAttempted: attemptedIds.length, submittedAttempts: stat.attempts, notAttempted: Math.max(0, totalStudents - attemptedIds.length), averageScore: Math.round((stat.averageScore || 0) * 100) / 100, highestScore: stat.highestScore, lowestScore: stat.lowestScore };
}
async function assertQuestionsEditable(quiz) {
  if (quiz.lockedAt || quiz.status !== 'draft' || await Attempt.exists({ quizId: quiz._id })) throw new HttpError(409, 'Questions are locked after the quiz is scheduled or live, or an attempt has started. Return to draft before launch to edit them.');
}
router.get('/dashboard', async (_req, res) => {
  const quiz = await currentQuiz();

  const attemptedStudentIds = await Attempt.distinct('studentId', {
    quizId: quiz._id
  });

  const [students, attempts, submitted, notAttempted, questions, stats] =
    await Promise.all([
      Student.countDocuments({ isActive: true }),

      Attempt.countDocuments({ quizId: quiz._id }),

      Attempt.countDocuments({
        quizId: quiz._id,
        status: mongoose.trusted({
          $in: ['submitted', 'auto_submitted', 'expired']
        })
      }),

      Student.countDocuments({
        isActive: true,
        _id: mongoose.trusted({
          $nin: attemptedStudentIds
        })
      }),

      Question.countDocuments({ quizId: quiz._id }),

      resultStats(quiz)
    ]);

  res.json({
    counts: {
      registeredStudents: students,
      attempts,
      submittedAttempts: submitted,
      notAttempted,
      questions
    },
    quiz: {
      title: quiz.title,
      status: getQuizState(quiz),
      startAt: quiz.startAt,
      endAt: quiz.endAt
    },
    results: stats
  });
});
router.get('/students', async (req, res) => {
  const quiz = await currentQuiz();
  const { page, limit, skip } = pageParams(req.query);
  const match = {};
  if (req.query.search) { const pattern = new RegExp(escapeRegex(String(req.query.search).slice(0, 100)), 'i'); match.$or = [{ name: pattern }, { scholarNumber: pattern }]; }
  if (req.query.active === 'true') match.isActive = true;
  if (req.query.active === 'false') match.isActive = false;
  const attemptFilter = req.query.attemptStatus;
  const pipeline = [
    { $match: match },
    { $lookup: { from: 'attempts', let: { sid: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$studentId', '$$sid'] }, { $eq: ['$quizId', quiz._id] }] } } }, { $project: { status: 1 } }, { $limit: 1 }], as: 'attempts' } },
    { $addFields: { attemptStatus: { $ifNull: [{ $arrayElemAt: ['$attempts.status', 0] }, 'not_attempted'] } } }
  ];
  if (attemptFilter && attemptFilter !== 'all') pipeline.push({ $match: attemptFilter === 'attempted' ? { attemptStatus: { $ne: 'not_attempted' } } : { attemptStatus: attemptFilter } });
  const [facet] = await Student.aggregate([...pipeline, { $facet: { data: [{ $sort: { name: 1, _id: 1 } }, { $skip: skip }, { $limit: limit }, { $project: { name: 1, scholarNumber: 1, email: 1, isActive: 1, createdAt: 1, attemptStatus: 1 } }], total: [{ $count: 'value' }] } }]);
  const total = facet?.total?.[0]?.value || 0;
  res.json({ students: (facet?.data || []).map((s) => ({ ...s, id: String(s._id) })), page, limit, total, pages: Math.ceil(total / limit) });
});
router.post('/students', async (req, res) => {
  const data = checked(studentSchema, req.body || {});
  data.scholarNumber = normalizeScholarNumber(data.scholarNumber);
  try { const student = await Student.create(data); res.status(201).json({ student: { id: String(student._id), name: student.name, scholarNumber: student.scholarNumber, email: student.email, isActive: student.isActive } }); }
  catch (error) { if (error.code === 11000) throw new HttpError(409, 'A student with that scholar number already exists.'); throw error; }
});
router.put('/students/:studentId', async (req, res) => {
  if (!objectId(req.params.studentId)) throw new HttpError(400, 'Invalid student id.');
  const data = checked(studentSchema.partial().omit({ isActive: true }), req.body || {});
  if (data.scholarNumber) data.scholarNumber = normalizeScholarNumber(data.scholarNumber);
  try { const student = await Student.findByIdAndUpdate(req.params.studentId, { $set: data }, { new: true, runValidators: true }).select('name scholarNumber email isActive'); if (!student) throw new HttpError(404, 'Student not found.'); res.json({ student: { id: String(student._id), ...student.toObject() } }); }
  catch (error) { if (error.code === 11000) throw new HttpError(409, 'A student with that scholar number already exists.'); throw error; }
});
router.patch('/students/:studentId/status', async (req, res) => {
  if (!objectId(req.params.studentId) || typeof req.body?.isActive !== 'boolean') throw new HttpError(400, 'Provide a valid student id and active status.');
  const student = await Student.findByIdAndUpdate(req.params.studentId, { $set: { isActive: req.body.isActive } }, { new: true }).select('name scholarNumber email isActive');
  if (!student) throw new HttpError(404, 'Student not found.');
  res.json({ student: { id: String(student._id), name: student.name, scholarNumber: student.scholarNumber, email: student.email, isActive: student.isActive } });
});
router.get('/students/import-template', (_req, res) => {
  const csv = 'name,scholarNumber,email\nRahul Sharma,240001,rahul@example.com\nPriya Reddy,240002,priya@example.com\nArjun Kumar,240003,arjun@example.com\nSneha Patel,240004,sneha@example.com\n';
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="students_template.csv"').send(csv);
});
const upload = (await import('multer')).default({ storage: (await import('multer')).memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1 }, fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) });
router.post('/students/import', (req, res, next) => upload.single('file')(req, res, (err) => { if (err) return next(new HttpError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, err.message || 'Could not read uploaded file.')); if (!req.file) return next(new HttpError(400, 'Select a CSV file to continue.')); next(); }), async (req, res) => {
  const rows = parseStudentCsv(req.file.buffer);
  const normalized = rows.map((row) => ({ ...row, record: { ...row.record, scholarNumber: normalizeScholarNumber(row.record.scholarNumber) } }));
  const incoming = [...new Set(normalized.map((r) => r.record.scholarNumber).filter(Boolean))];
  const existing = new Set(
    (
      await Student.find({
        scholarNumber: mongoose.trusted({
          $in: incoming
        })
      })
        .select('scholarNumber')
        .lean()
    ).map((student) => student.scholarNumber)
  ); const summary = validateRows(normalized, existing);
  if (req.body.mode !== 'commit') return res.json({ preview: true, totalRows: summary.totalRows, validRows: summary.candidates.length, duplicateSkipped: summary.duplicateSkipped, invalidRows: summary.invalidRejected, existingSkipped: summary.existingSkipped, candidates: summary.candidates.slice(0, 100), moreCandidates: summary.candidates.length > 100, failures: summary.failures.slice(0, 100), moreFailures: summary.failures.length > 100 });
  let imported = 0;
  for (let offset = 0; offset < summary.candidates.length; offset += 250) {
    const batch = summary.candidates.slice(offset, offset + 250);
    const outcomes = await Promise.allSettled(batch.map(async (candidate) => {
      try {
        const result = await Student.findOneAndUpdate({ scholarNumber: candidate.scholarNumber }, { $setOnInsert: { name: candidate.name, scholarNumber: candidate.scholarNumber, email: candidate.email, isActive: true } }, { upsert: true, new: true, includeResultMetadata: true, runValidators: true });
        return { inserted: !result.lastErrorObject?.updatedExisting };
      } catch (error) {
        if (error.code === 11000) return { inserted: false, raced: true };
        throw error;
      }
    }));
    const failed = outcomes.find((o) => o.status === 'rejected');
    if (failed) throw failed.reason;
    for (let index = 0; index < outcomes.length; index++) {
      const outcome = outcomes[index].value;
      if (outcome.inserted) imported++;
      else {
        summary.existingSkipped++;
        summary.failures.push({ ...normalized.find((row) => row.rowNumber === batch[index].rowNumber).original, rowNumber: batch[index].rowNumber, reason: 'Scholar number already exists in the database (including a concurrent import).', category: 'existing' });
      }
    }
  }
  summary.imported = imported;
  const failuresCsv = makeFailureCsv(summary.failures);
  res.json({ preview: false, summary: { totalRowsProcessed: summary.totalRows, successfullyImported: imported, duplicateRowsSkipped: summary.duplicateSkipped, invalidRowsRejected: summary.invalidRejected, existingRecordsSkipped: summary.existingSkipped }, failureCount: summary.failures.length, failuresCsv });
});
router.get('/questions', async (_req, res) => { const quiz = await currentQuiz(); const questions = await Question.find({ quizId: quiz._id }).sort({ order: 1 }).lean(); res.json({ questions: questions.map((q) => ({ id: String(q._id), prompt: q.prompt, imageUrl: q.imageUrl || null, options: q.options, correctOption: q.correctOption, order: q.order })) }); });
router.post('/questions', async (req, res) => {
  const quiz = await currentQuiz(); await assertQuestionsEditable(quiz);
  const data = checked(questionSchema, req.body || {});
  const lastQuestion = await Question.findOne({ quizId: quiz._id }).sort({ order: -1 }).select('order').lean();
  const order = data.order ?? ((lastQuestion?.order ?? -1) + 1);
  const question = await Question.create({ ...data, order, quizId: quiz._id });
  res.status(201).json({ question: { id: String(question._id), prompt: question.prompt, options: question.options, correctOption: question.correctOption, order: question.order } });
});
router.put('/questions/reorder', async (req, res) => {
  const quiz = await currentQuiz(); await assertQuestionsEditable(quiz);
  const ids = req.body?.questionIds;
  if (!Array.isArray(ids) || ids.some((id) => !objectId(id))) throw new HttpError(400, 'Provide a valid ordered list of question ids.');
  const questions = await Question.find({ quizId: quiz._id }).select('_id').lean();
  if (new Set(ids).size !== ids.length || ids.length !== questions.length || ids.some((id) => !questions.some((q) => String(q._id) === id))) throw new HttpError(400, 'The order must include each quiz question exactly once.');
  await Question.updateMany({ quizId: quiz._id }, { $inc: { order: 100000 } });
  await Promise.all(ids.map((id, order) => Question.updateOne({ _id: id, quizId: quiz._id }, { $set: { order } })));
  res.json({ ok: true });
});
router.put('/questions/:questionId', async (req, res) => {
  const quiz = await currentQuiz(); await assertQuestionsEditable(quiz);
  if (!objectId(req.params.questionId)) throw new HttpError(400, 'Invalid question id.');
  const data = checked(questionSchema, req.body || {});
  delete data.order;
  const question = await Question.findOneAndUpdate({ _id: req.params.questionId, quizId: quiz._id }, { $set: data }, { new: true, runValidators: true });
  if (!question) throw new HttpError(404, 'Question not found.');
  res.json({ question: { id: String(question._id), prompt: question.prompt, options: question.options, correctOption: question.correctOption, order: question.order } });
});
router.delete('/questions/:questionId', async (req, res) => {
  const quiz = await currentQuiz(); await assertQuestionsEditable(quiz);
  if (!objectId(req.params.questionId)) throw new HttpError(400, 'Invalid question id.');
  const question = await Question.findOneAndDelete({ _id: req.params.questionId, quizId: quiz._id });
  if (!question) throw new HttpError(404, 'Question not found.');
  res.json({ ok: true });
});
router.get('/quiz/settings', async (_req, res) => { const quiz = await currentQuiz(); res.json({ quiz: { id: String(quiz._id), title: quiz.title, instructions: quiz.instructions, status: getQuizState(quiz), configuredStatus: quiz.status, startAt: quiz.startAt, endAt: quiz.endAt, durationMinutes: quiz.durationMinutes, resultsVisible: quiz.resultsVisible, questionVersion: quiz.questionVersion, locked: Boolean(quiz.lockedAt) } }); });
router.put('/quiz/settings', async (req, res) => {
  const quiz = await currentQuiz();
  if (quiz.lockedAt || quiz.status === 'live' || await Attempt.exists({ quizId: quiz._id })) throw new HttpError(409, 'Quiz settings are locked after the quiz goes live or an attempt starts. Close the quiz to stop attempts.');
  const data = checked(settingsSchema, req.body || {});
  if (data.status === 'live' && await Question.countDocuments({ quizId: quiz._id }) < 1) throw new HttpError(409, 'Add at least one valid question before making the quiz live.');
  if (data.status === 'live' && (!data.startAt || !data.endAt)) throw new HttpError(400, 'Set both official start and end times before going live.');
  Object.assign(quiz, { title: data.title, instructions: data.instructions, startAt: data.startAt, endAt: data.endAt, durationMinutes: data.durationMinutes, resultsVisible: data.resultsVisible ?? quiz.resultsVisible });
  if (data.status) quiz.status = data.status;
  if (data.status === 'live' || data.status === 'scheduled') quiz.lockedAt = new Date();
  await quiz.save();
  res.json({ quiz: { title: quiz.title, instructions: quiz.instructions, status: getQuizState(quiz), configuredStatus: quiz.status, startAt: quiz.startAt, endAt: quiz.endAt, durationMinutes: quiz.durationMinutes, locked: Boolean(quiz.lockedAt) } });
});
router.post('/quiz/start', async (_req, res) => {
  const quiz = await currentQuiz();
  if (!await Question.exists({ quizId: quiz._id })) throw new HttpError(409, 'Add at least one question before starting the quiz.');
  if (!quiz.startAt || !quiz.endAt || quiz.endAt <= quiz.startAt) throw new HttpError(409, 'Configure valid official start and end times first.');
  if (quiz.endAt <= new Date()) throw new HttpError(409, 'The configured end time has already passed.');
  quiz.status = quiz.startAt > new Date() ? 'scheduled' : 'live';
  quiz.pausedAt = null;
  quiz.lockedAt = new Date();
  await quiz.save();
  res.json({ status: getQuizState(quiz), startAt: quiz.startAt, endAt: quiz.endAt });
});
router.post('/quiz/close', async (_req, res) => { const quiz = await currentQuiz(); const now = new Date(); quiz.status = 'closed'; quiz.endAt = now; await quiz.save(); await Attempt.updateMany({ quizId: quiz._id, status: 'in_progress' }, { $set: { deadlineAt: now } }); await finalizeExpiredAttempts(now); res.json({ status: 'closed' }); });

router.post('/quiz/pause', async (_req, res) => {
  const quiz = await currentQuiz();
  if (!['live', 'scheduled'].includes(quiz.status) || getQuizState(quiz) === 'closed') {
    throw new HttpError(409, 'Only a scheduled or live quiz can be paused.');
  }
  quiz.status = 'paused';
  quiz.pausedAt = new Date();
  await quiz.save();
  res.json({ status: 'paused', pausedAt: quiz.pausedAt });
});

router.post('/quiz/resume', async (_req, res) => {
  const quiz = await currentQuiz();
  const now = new Date();
  if (quiz.status !== 'paused' || !quiz.pausedAt) throw new HttpError(409, 'The quiz is not paused.');
  const pauseDurationMs = Math.max(0, now.getTime() - new Date(quiz.pausedAt).getTime());
  if (pauseDurationMs > 0) {
    await Attempt.updateMany(
      { quizId: quiz._id, status: 'in_progress' },
      [{ $set: { deadlineAt: { $add: ['$deadlineAt', pauseDurationMs] } } }]
    );
  }
  quiz.status = quiz.startAt > now ? 'scheduled' : 'live';
  quiz.pausedAt = null;
  await quiz.save();
  res.json({ status: getQuizState(quiz), startAt: quiz.startAt, endAt: quiz.endAt });
});

router.post('/quiz/reset', async (_req, res) => {
  const quiz = await currentQuiz();

  // Do not reset while students still have active attempts.
  const activeAttempts = await Attempt.countDocuments({
  quizId: quiz._id,
  status: mongoose.trusted({
    $in: ['in_progress', 'finalizing']
  })
});

  if (activeAttempts > 0) {
    throw new HttpError(
      409,
      'Cannot reset while attempts are still active. Close the quiz first.'
    );
  }

  // IMPORTANT: This permanently deletes this quiz's old attempts/results.
  await Attempt.deleteMany({ quizId: quiz._id });

  // Keep the same quiz and its existing questions.
  quiz.status = 'draft';
  quiz.startAt = null;
  quiz.endAt = null;
  quiz.pausedAt = null;
  quiz.lockedAt = null;
  quiz.resultsVisible = false;
  await quiz.save();

  res.json({
    ok: true,
    message: 'Quiz reset. Existing questions are preserved.'
  });
});

router.get('/results', async (req, res) => { const quiz = await currentQuiz(); const [result, stats] = await Promise.all([resultRows(quiz, req.query), resultStats(quiz)]); res.json({ ...result, stats }); });
router.get('/results/export', async (req, res) => {
  const quiz = await currentQuiz();
  const result = await resultRows(quiz, { ...req.query, page: 1, limit: 250000 }, true);
  const csv = stringify(result.rows.map((r) => ({ studentName: escapeCsvCell(r.studentName), scholarNumber: escapeCsvCell(r.scholarNumber), correctAnswers: r.correctAnswers ?? '', totalQuestions: r.totalQuestions, percentage: r.percentage ?? '', status: r.status, submittedAt: r.submittedAt ? new Date(r.submittedAt).toISOString() : '' })), { header: true, columns: ['studentName', 'scholarNumber', 'correctAnswers', 'totalQuestions', 'percentage', 'status', 'submittedAt'] });
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="spark_quiz_results.csv"').send(csv);
});
export default router;
