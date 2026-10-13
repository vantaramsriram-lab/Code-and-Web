
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import Quiz from '../models/Quiz.js';
import { finalizeExpiredAttempts } from '../services/attempts.js';

export function startQuizJobs() {
  const timer = setInterval(async () => {
    try {
      const now = new Date();

      await Quiz.updateOne(
        {
          key: 'current',
          status: 'scheduled',
          startAt: mongoose.trusted({ $lte: now }),
          endAt: mongoose.trusted({ $gt: now })
        },
        {
          $set: { status: 'live', lockedAt: now }
        }
      );

      await Quiz.updateOne(
        {
          key: 'current',
          status: mongoose.trusted({
            $in: ['live', 'scheduled']
          }),
          endAt: mongoose.trusted({ $lte: now })
        },
        {
          $set: { status: 'closed' }
        }
      );

      const count = await finalizeExpiredAttempts(now);

      if (count) {
        console.info(JSON.stringify({
          level: 'info',
          event: 'expired_attempts_finalized',
          count
        }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'quiz_job_failed',
        message: error.message
      }));
    }
  }, env.QUIZ_EXPIRY_POLL_MS);

  timer.unref();
  return () => clearInterval(timer);
}
