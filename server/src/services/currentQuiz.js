import Quiz from '../models/Quiz.js';
export async function currentQuiz() {
  let quiz = await Quiz.findOne({ key: 'current' });
  if (!quiz) {
    try { quiz = await Quiz.create({ key: 'current', title: 'Spark Club Quiz', instructions: 'Choose the best answer for each question. Your answers are saved as you go.', status: 'draft' }); }
    catch (error) { if (error.code !== 11000) throw error; quiz = await Quiz.findOne({ key: 'current' }); }
  }
  return quiz;
}
