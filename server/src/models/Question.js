import mongoose from 'mongoose';
const questionSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
  prompt: { type: String, required: true, trim: true, maxlength: 2000 },
  // Optional URL for questions that need a diagram or illustration.
  imageUrl: { type: String, trim: true, maxlength: 2048, default: null },
  options: { type: [{ type: String, trim: true, maxlength: 500 }], validate: [(a) => a.length >= 2 && a.length <= 6, 'Provide between 2 and 6 options'] },
  correctOption: { type: Number, required: true, min: 0 },
  order: { type: Number, required: true, min: 0 }
}, { timestamps: true });
questionSchema.index({ quizId: 1, order: 1 }, { unique: true });
questionSchema.pre('validate', function () { if (this.correctOption >= this.options.length) this.invalidate('correctOption', 'Correct option must refer to an available option'); });
export default mongoose.model('Question', questionSchema);
