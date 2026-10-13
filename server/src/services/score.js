export function scoreAnswers(questions, answers) {
  let score = 0;
  for (const q of questions) {
    const answer = answers instanceof Map ? answers.get(String(q._id)) : answers?.[String(q._id)];
    if (Number(answer?.selectedOption) === Number(q.correctOption)) score++;
  }
  return score;
}
export function percentage(score, total) { return total > 0 ? Math.round((score / total) * 10000) / 100 : 0; }
