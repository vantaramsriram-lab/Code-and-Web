import mongoose from 'mongoose';
const quizSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'current' },
  title: { type: String, required: true, trim: true, maxlength: 160, default: 'Spark Club Quiz' },
  instructions: { type: String, trim: true, maxlength: 5000, default: 'Choose the best answer for each question. Your answers are saved as you go.' },
  status: { type: String, enum: ['draft', 'scheduled', 'live', 'closed'], default: 'draft', index: true },
  startAt: { type: Date, default: null },
  endAt: { type: Date, default: null },
  resultsVisible: { type: Boolean, default: false },
  questionVersion: { type: Number, default: 1 },
  lockedAt: { type: Date, default: null }
}, { timestamps: true });
quizSchema.index({ status: 1, startAt: 1, endAt: 1 });
export default mongoose.model('Quiz', quizSchema);
