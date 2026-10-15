import { Router } from 'express';
import mongoose from 'mongoose';
import Attempt from '../models/Attempt.js';
import Question from '../models/Question.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import { currentQuiz } from '../services/currentQuiz.js';
import { finalizeAttempt } from '../services/attempts.js';
import { getQuizState } from '../services/quizState.js';
const router = Router();
router.use(requireAuth, requireRole('student'));
const idOk = (id) => mongoose.isValidObjectId(id);
function answerObject(attempt) {
  const map = attempt.answers instanceof Map ? attempt.answers : new Map(Object.entries(attempt.answers?.toObject?.() || attempt.answers || {}));
  return { answers: Object.fromEntries([...map.entries()].map(([id, value]) => [id, value.selectedOption])), answerRevisions: Object.fromEntries([...map.entries()].map(([id, value]) => [id, value.revision])) };
}
function snapshot(attempt) { return attempt.questionSnapshot.map((q) => ({ id: String(q.questionId), prompt: q.prompt, options: q.options })); }
router.get('/quiz/current', async (_req, res) => {
  const quiz = await currentQuiz();
  const questionCount = await Question.countDocuments({ quizId: quiz._id });
  res.json({ title: quiz.title, instructions: quiz.instructions, state: getQuizState(quiz), startAt: quiz.startAt, endAt: quiz.endAt, durationMinutes: quiz.durationMinutes, questionCount });
});
router.post('/quiz/attempt/start', async (req, res) => {
  const quiz = await currentQuiz();
  const now = new Date();
  const state = getQuizState(quiz, now);
  if (state !== 'live') throw new HttpError(409, state === 'scheduled' ? 'The quiz has not started yet.' : 'The quiz is not accepting new attempts.');
  const questions = await Question.find({ quizId: quiz._id }).sort({ order: 1 }).select('_id prompt options').lean();
  if (!questions.length) throw new HttpError(409, 'This quiz is not ready yet.');
  const startNow = new Date();
  if (getQuizState(quiz, startNow) !== 'live') throw new HttpError(409, 'The quiz is no longer accepting new attempts.');
  const deadlineAt = new Date(startNow.getTime() + quiz.durationMinutes * 60 * 1000);
  if (deadlineAt <= now) throw new HttpError(409, 'The quiz has closed.');
  let attempt;
  try {
    attempt = await Attempt.create({ quizId: quiz._id, studentId: req.auth.id, status: 'in_progress', answers: {}, questionSnapshot: questions.map((q) => ({ questionId: q._id, prompt: q.prompt, options: q.options })), totalQuestions: questions.length, startedAt: startNow, deadlineAt });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    attempt = await Attempt.findOne({ quizId: quiz._id, studentId: req.auth.id }).select('+questionSnapshot');
    if (attempt?.status === 'in_progress' && attempt.deadlineAt > now) return res.json({ attempt: { id: String(attempt._id), status: attempt.status, deadlineAt: attempt.deadlineAt, serverNow: new Date(), questions: snapshot(attempt), ...answerObject(attempt) } });
    throw new HttpError(409, 'You have already used your attempt for this quiz.');
  }
  if (!quiz.lockedAt) {
    await quiz.updateOne(
      { _id: quiz._id, lockedAt: null },
      {
        $set: { lockedAt: now },
        $inc: { questionVersion: 1 }
      }
    );
  } res.status(201).json({ attempt: { id: String(attempt._id), status: attempt.status, deadlineAt: attempt.deadlineAt, serverNow: new Date(), questions: snapshot(attempt), answers: {}, answerRevisions: {} } });
});
router.get('/quiz/attempt/current', async (req, res) => {
  const quiz = await currentQuiz();
  let attempt = await Attempt.findOne({ quizId: quiz._id, studentId: req.auth.id }).select('+questionSnapshot');
  if (!attempt) return res.json({ attempt: null, serverNow: new Date() });
  if (attempt.status === 'in_progress' && quiz.status !== 'paused' && attempt.deadlineAt <= new Date()) attempt = await finalizeAttempt(attempt._id, 'expired');
  if (attempt.status === 'finalizing') attempt = await finalizeAttempt(attempt._id, attempt.violationReason ? 'auto_submitted' : attempt.deadlineAt <= new Date() ? 'expired' : 'submitted');
  res.json({ attempt: { id: String(attempt._id), status: attempt.status, deadlineAt: attempt.deadlineAt, submittedAt: attempt.submittedAt, serverNow: new Date(), questions: snapshot(attempt), ...answerObject(attempt) } });
});
router.put('/quiz/attempt/:attemptId/answer', async (req, res) => {
  const { attemptId } = req.params;
  const { questionId, selectedOption, revision } = req.body || {};
  if (!idOk(attemptId) || !idOk(questionId) || !Number.isInteger(selectedOption) || !Number.isInteger(revision) || revision < 1 || revision > 1000000) throw new HttpError(400, 'Invalid answer update.');
  let attempt = await Attempt.findOne({ _id: attemptId, studentId: req.auth.id }).select('+questionSnapshot');
  if (!attempt) throw new HttpError(404, 'Attempt not found.');
  if (attempt.status !== 'in_progress') throw new HttpError(409, 'This attempt is already finalized.');
  const activeQuiz = await currentQuiz();
  if (activeQuiz.status === 'paused') throw new HttpError(409, 'The quiz is paused. Your timer will resume when the administrator resumes the quiz.');
  if (new Date() >= attempt.deadlineAt) { await finalizeAttempt(attempt._id, 'expired'); throw new HttpError(409, 'The quiz deadline has passed.'); }
  const question = attempt.questionSnapshot.find((q) => String(q.questionId) === questionId);
  if (!question || selectedOption < 0 || selectedOption >= question.options.length) throw new HttpError(400, 'Invalid question or answer option.');
  const path = `answers.${questionId}`;

  const filter = {
    _id: attempt._id,
    studentId: req.auth.id,
    status: 'in_progress',
    deadlineAt: mongoose.trusted({ $gt: new Date() }),
    $or: [
      { [`${path}.revision`]: mongoose.trusted({ $exists: false }) },
      { [`${path}.revision`]: mongoose.trusted({ $lt: revision }) },
      {
        [`${path}.revision`]: revision,
        [`${path}.selectedOption`]: selectedOption
      }
    ]
  };
  const updated = await Attempt.findOneAndUpdate(filter, { $set: { [path]: { selectedOption, revision } } }, { new: true });
  if (updated) return res.json({ saved: true, selectedOption, revision });
  attempt = await Attempt.findById(attempt._id);
  if (!attempt || attempt.status !== 'in_progress') throw new HttpError(409, 'This attempt is already finalized.');
  const current = attempt.answers instanceof Map ? attempt.answers.get(questionId) : attempt.answers?.[questionId];
  if (current && current.revision >= revision) return res.json({ saved: true, selectedOption: current.selectedOption, revision: current.revision });
  throw new HttpError(409, 'The quiz deadline has passed or the answer could not be saved. Please refresh.');
});
router.post('/quiz/attempt/:attemptId/submit', async (req, res) => {
  if (!idOk(req.params.attemptId)) throw new HttpError(400, 'Invalid attempt.');
  const attempt = await Attempt.findOne({ _id: req.params.attemptId, studentId: req.auth.id });
  if (!attempt) throw new HttpError(404, 'Attempt not found.');
  const activeQuiz = await currentQuiz();
  if (activeQuiz.status === 'paused') throw new HttpError(409, 'The quiz is paused. You can submit after the administrator resumes it.');
  const finalStatus = new Date() >= attempt.deadlineAt ? 'expired' : 'submitted';
  const finished = await finalizeAttempt(attempt._id, finalStatus);
  res.json({ message: 'Your quiz has been submitted successfully. Your responses have been recorded. Thank you for participating.', status: finished?.status || finalStatus, submittedAt: finished?.submittedAt, reference: String(attempt._id).slice(-8).toUpperCase() });
});
router.post('/quiz/attempt/:attemptId/violation', async (req, res) => {
  if (!idOk(req.params.attemptId)) throw new HttpError(400, 'Invalid attempt.');
  const attempt = await Attempt.findOne({ _id: req.params.attemptId, studentId: req.auth.id });
  if (!attempt) throw new HttpError(404, 'Attempt not found.');
  const finalStatus = new Date() >= attempt.deadlineAt ? 'expired' : 'auto_submitted';
  const finished = await finalizeAttempt(attempt._id, finalStatus, 'prohibited_tab_switch');
  res.json({ message: 'Your attempt has been finalized.', status: finished?.status || finalStatus, submittedAt: finished?.submittedAt });
});
router.get('/quiz/attempt/:attemptId/confirmation', async (req, res) => {
  if (!idOk(req.params.attemptId)) throw new HttpError(400, 'Invalid attempt.');
  const attempt = await Attempt.findOne({ _id: req.params.attemptId, studentId: req.auth.id }).select('_id status submittedAt');
  if (!attempt) throw new HttpError(404, 'Attempt not found.');
  if (attempt.status === 'in_progress') throw new HttpError(409, 'This attempt is still in progress.');
  res.json({ status: attempt.status, submittedAt: attempt.submittedAt, reference: String(attempt._id).slice(-8).toUpperCase() });
});
export default router;
