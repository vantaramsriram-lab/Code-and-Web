import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Attempt from '../src/models/Attempt.js';

try {
  await connectDB();

  // Remove the legacy constraint that allowed only one attempt ever per student/quiz.
  try {
    await Attempt.collection.dropIndex('quizId_1_studentId_1');
    console.info('Dropped legacy quiz/student unique index.');
  } catch (error) {
    if (error?.code !== 27 && error?.codeName !== 'IndexNotFound') throw error;
    console.info('Legacy quiz/student unique index was already absent.');
  }

  // Backfill existing attempts without overwriting values if the migration is rerun.
  const result = await Attempt.collection.updateMany({}, [{
    $set: {
      attemptNumber: { $ifNull: ['$attemptNumber', 1] },
      countedForLeaderboard: { $ifNull: ['$countedForLeaderboard', true] },
      retakeApprovedAt: { $ifNull: ['$retakeApprovedAt', null] },
      retakeApprovedBy: { $ifNull: ['$retakeApprovedBy', null] },
      retakeReason: { $ifNull: ['$retakeReason', null] },
      retakeConsumedAt: { $ifNull: ['$retakeConsumedAt', null] }
    }
  }]);

  await Attempt.createIndexes();
  console.info(JSON.stringify({ event: 'retake_migration_complete', matched: result.matchedCount, modified: result.modifiedCount }));
} catch (error) {
  console.error(JSON.stringify({ event: 'retake_migration_failed', message: error.message }));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
