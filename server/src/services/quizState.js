export function publicQuestion(q) { return { id: String(q._id), prompt: q.prompt, options: q.options }; }
export function getQuizState(quiz, now = new Date()) {
  if (!quiz) return 'unavailable';
  if (quiz.status === 'closed') return 'closed';
  if (quiz.status === 'paused') return 'paused';
  if (quiz.endAt && now >= new Date(quiz.endAt)) return 'closed';
  if (quiz.status === 'draft') return 'draft';
  if (quiz.startAt && now < new Date(quiz.startAt)) return 'scheduled';
  if (quiz.status === 'live' || quiz.status === 'scheduled') return 'live';
  return 'scheduled';
}
