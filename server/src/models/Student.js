import mongoose from 'mongoose';
import { normalizeScholarNumber } from '../utils/normalize.js';
const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  scholarNumber: { type: String, required: true, trim: true, unique: true, maxlength: 40 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
studentSchema.pre('validate', function () { if (this.scholarNumber) this.scholarNumber = normalizeScholarNumber(this.scholarNumber); });
studentSchema.index({ name: 1 });
studentSchema.index({ isActive: 1 });
export default mongoose.model('Student', studentSchema);
