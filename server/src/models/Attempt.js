import mongoose from 'mongoose';
const answerSchema = new mongoose.Schema({ selectedOption: { type: Number, min: 0 }, revision: { type: Number, min: 1 } }, { _id: false });
const snapshotSchema = new mongoose.Schema({ questionId: { type: mongoose.Schema.Types.ObjectId, required: true }, prompt: { type: String, required: true }, options: [{ type: String }] }, { _id: false });
const attemptSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  status: { type: String, enum: ['in_progress', 'finalizing', 'submitted', 'expired'], default: 'in_progress', index: true },
  finalizeAs: { type: String, enum: ['submitted', 'expired'], default: null, select: false },
  answers: { type: Map, of: answerSchema, default: {} },
  questionSnapshot: { type: [snapshotSchema], required: true, select: false },
  score: { type: Number, default: null },
  totalQuestions: { type: Number, required: true },
  startedAt: { type: Date, required: true },
  deadlineAt: { type: Date, required: true },
  submittedAt: { type: Date, default: null },
  violationReason: { type: String, default: null }
}, { timestamps: true });

// Prevent concurrent duplicate active attempts while allowing an admin-cleared retake.
attemptSchema.index({ quizId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['in_progress', 'finalizing'] } }, name: 'active_attempt_per_student_quiz' });
attemptSchema.index({ status: 1, deadlineAt: 1 });
attemptSchema.index({ quizId: 1, status: 1, score: -1, submittedAt: 1 });
export default mongoose.model('Attempt', attemptSchema);
