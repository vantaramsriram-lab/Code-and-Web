import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { scenarios: { student_quiz: { executor: 'per-vu-iterations', vus: Number(__ENV.VUS || 150), iterations: 1, maxDuration: '5m' } }, thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1500'] } };
const base = (__ENV.BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
export default function () {
  const scholarNumber = `99${String(__VU).padStart(4, '0')}`;
  const headers = { 'Content-Type': 'application/json' };
  const entry = http.post(`${base}/api/student/entry`, JSON.stringify({ scholarNumber }), { headers });
  check(entry, { 'student entry accepted': (r) => r.status === 200 }); if (entry.status !== 200) return;
  const current = http.get(`${base}/api/quiz/current`);
  check(current, { 'quiz loaded': (r) => r.status === 200 }); if (current.status !== 200) return;
  const started = http.post(`${base}/api/quiz/attempt/start`, null, { headers });
  check(started, { 'attempt started': (r) => r.status === 201 || r.status === 200 }); if (![200, 201].includes(started.status)) return;
  const attempt = started.json('attempt');
  if (attempt.questions?.length) {
    const answer = http.put(`${base}/api/quiz/attempt/${attempt.id}/answer`, JSON.stringify({ questionId: attempt.questions[0].id, selectedOption: 0, revision: 1 }), { headers });
    check(answer, { 'answer saved': (r) => r.status === 200 });
  }
  const submitted = http.post(`${base}/api/quiz/attempt/${attempt.id}/submit`, null, { headers });
  check(submitted, { 'attempt submitted': (r) => r.status === 200 && !JSON.stringify(r.json()).includes('score') });
  sleep(0.1);
}
