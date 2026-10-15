import mongoose from 'mongoose';
import Attempt from '../models/Attempt.js';
import Question from '../models/Question.js';
import Quiz from '../models/Quiz.js';
import { scoreAnswers } from './score.js';

/** Claim first so no answer can race into the scoring snapshot. Idempotent across submit, expiry, and visibility events. */
export async function finalizeAttempt(attemptId, finalStatus = 'submitted', reason = null, now = new Date()) {
  const allowed = ['submitted', 'auto_submitted', 'expired'];
  if (!allowed.includes(finalStatus)) throw new Error('Invalid final attempt status');
  let attempt = await Attempt.findOneAndUpdate(
    { _id: attemptId, status: 'in_progress' },
    { $set: { status: 'finalizing', finalizeAs: finalStatus, ...(reason ? { violationReason: reason } : {}) } },
    { new: true }
  ).select('+questionSnapshot +finalizeAs');
  if (!attempt) {
    attempt = await Attempt.findById(attemptId).select('+questionSnapshot +finalizeAs');
    if (!attempt || attempt.status !== 'finalizing') return attempt;
    // Recover the original intent if a process stopped while finalization was in progress.
    finalStatus = attempt.finalizeAs || (attempt.violationReason ? 'auto_submitted' : attempt.deadlineAt <= now ? 'expired' : finalStatus);
  }
  const questions = await Question.find({ quizId: attempt.quizId }).select('_id correctOption').lean();
  const answers = attempt.answers instanceof Map ? attempt.answers : attempt.answers?.toObject?.() || attempt.answers;
  const score = scoreAnswers(questions, answers);
  const finishedAt = now > attempt.deadlineAt ? attempt.deadlineAt : now;
  await Attempt.updateOne({ _id: attempt._id, status: 'finalizing' }, { $set: { status: finalStatus, score, totalQuestions: questions.length, submittedAt: finishedAt } });
  return Attempt.findById(attempt._id).select('+questionSnapshot');
}

export async function finalizeExpiredAttempts(now = new Date()) {
  const pausedQuizzes = await Quiz.find({ status: 'paused' }).select('_id').lean();
  const pausedQuizIds = pausedQuizzes.map((quiz) => quiz._id);
  const due = await Attempt.find({
    $or: [
      {
        status: 'in_progress',
        quizId: mongoose.trusted({ $nin: pausedQuizIds }),
        deadlineAt: mongoose.trusted({ $lte: now })
      },
      { status: 'finalizing' }
    ]
  })
    .select('_id')
    .limit(500)
    .lean();

  let finalized = 0;

  for (const { _id } of due) {
    const done = await finalizeAttempt(_id, 'expired', null, now);

    if (done && ['submitted', 'auto_submitted', 'expired'].includes(done.status)) {
      finalized++;
    }
  }

  return finalized;
}
