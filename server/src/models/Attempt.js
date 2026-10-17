import mongoose from 'mongoose';
const answerSchema = new mongoose.Schema({ selectedOption: { type: Number, min: 0 }, revision: { type: Number, min: 1 } }, { _id: false });
const snapshotSchema = new mongoose.Schema({ questionId: { type: mongoose.Schema.Types.ObjectId, required: true }, prompt: { type: String, required: true }, options: [{ type: String }] }, { _id: false });
const attemptSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  attemptNumber: { type: Number, min: 1, default: 1, required: true },
  countedForLeaderboard: { type: Boolean, default: false, index: true },
  retakeApprovedAt: { type: Date, default: null },
  retakeApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  retakeReason: { type: String, trim: true, maxlength: 500, default: null },
  retakeConsumedAt: { type: Date, default: null },
  status: { type: String, enum: ['in_progress', 'finalizing', 'submitted', 'auto_submitted', 'expired'], default: 'in_progress', index: true },
  finalizeAs: { type: String, enum: ['submitted', 'auto_submitted', 'expired'], default: null, select: false },
  answers: { type: Map, of: answerSchema, default: {} },
  questionSnapshot: { type: [snapshotSchema], required: true, select: false },
  score: { type: Number, default: null },
  totalQuestions: { type: Number, required: true },
  startedAt: { type: Date, required: true },
  deadlineAt: { type: Date, required: true },
  submittedAt: { type: Date, default: null },
  violationReason: { type: String, default: null }
}, { timestamps: true });

// Legacy unique quiz/student index is removed by scripts/migrateRetakes.js.
attemptSchema.index({ quizId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['in_progress', 'finalizing'] } } });
attemptSchema.index({ quizId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { countedForLeaderboard: true } });
attemptSchema.index({ status: 1, deadlineAt: 1 });
attemptSchema.index({ quizId: 1, status: 1, score: -1, submittedAt: 1 });
attemptSchema.index({ quizId: 1, studentId: 1, attemptNumber: -1 });
attemptSchema.index({ quizId: 1, studentId: 1, retakeConsumedAt: 1, retakeApprovedAt: -1 });
export default mongoose.model('Attempt', attemptSchema);
