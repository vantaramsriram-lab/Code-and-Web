// Local end-to-end concurrency smoke test. Uses an isolated MongoMemoryServer, never a configured database.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'local-load-test-secret-not-a-production-credential-123';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/spark_quiz_test';
const vus = Math.max(1, Math.min(200, Number(process.env.LOAD_VUS || 150)));
const { MongoMemoryServer } = await import('mongodb-memory-server');
const memory = await MongoMemoryServer.create({ instance: { dbName: 'spark_quiz_test' } });
process.env.MONGODB_URI = memory.getUri('spark_quiz_test');
const mongoose = (await import('mongoose')).default;
const Student = (await import('../src/models/Student.js')).default;
const Quiz = (await import('../src/models/Quiz.js')).default;
const Question = (await import('../src/models/Question.js')).default;
const Attempt = (await import('../src/models/Attempt.js')).default;
const { createApp } = await import('../src/app.js');
const { createServer } = await import('node:http');
const latencies = new Map();
const failures = [];
let completedFlows = 0;
function record(name, ms) { if (!latencies.has(name)) latencies.set(name, []); latencies.get(name).push(ms); }
function percentile(values, p) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return Math.round(sorted[Math.ceil(p * sorted.length) - 1] * 100) / 100; }
async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 40 });
  await Promise.all([Student, Quiz, Question, Attempt].map((model) => model.syncIndexes()));
  await Student.insertMany(Array.from({ length: vus }, (_, i) => ({ name: `Load Test Student ${i + 1}`, scholarNumber: `99${String(i + 1).padStart(4, '0')}`, email: `load${String(i + 1).padStart(4, '0')}@example.com`, isActive: true })));
  const now = new Date();
  const quiz = await Quiz.create({ key: 'current', title: 'Local load test', instructions: 'Synthetic load test only.', status: 'live', startAt: new Date(now.getTime() - 60000), endAt: new Date(now.getTime() + 30 * 60000), lockedAt: now });
  await Question.insertMany(Array.from({ length: 5 }, (_, i) => ({ quizId: quiz._id, prompt: `Synthetic question ${i + 1}`, options: ['A', 'B', 'C', 'D'], correctOption: 1, order: i })));
  const server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(name, path, { method = 'GET', body, cookie } = {}) {
    const started = performance.now();
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const elapsed = performance.now() - started; record(name, elapsed);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) failures.push({ name, status: response.status, message: payload.message });
    return { response, payload, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
  }
  const overallStart = performance.now();
  await Promise.all(Array.from({ length: vus }, async (_, i) => {
    try {
      const scholarNumber = `99${String(i + 1).padStart(4, '0')}`;
      const entry = await call('student_entry', '/student/entry', { method: 'POST', body: { scholarNumber } });
      if (entry.response.status !== 200) return;
      const current = await call('load_current_quiz', '/quiz/current', { cookie: entry.cookie });
      if (current.response.status !== 200) return;
      const start = await call('start_attempt', '/quiz/attempt/start', { method: 'POST', cookie: entry.cookie });
      if (![200, 201].includes(start.response.status)) return;
      const attempt = start.payload.attempt;
      const answer = await call('save_answer', `/quiz/attempt/${attempt.id}/answer`, { method: 'PUT', cookie: entry.cookie, body: { questionId: attempt.questions[0].id, selectedOption: 1, revision: 1 } });
      if (answer.response.status !== 200) return;
      const submitted = await call('submit_attempt', `/quiz/attempt/${attempt.id}/submit`, { method: 'POST', cookie: entry.cookie });
      if (submitted.response.status !== 200 || submitted.payload.score !== undefined || submitted.payload.correctAnswers !== undefined) { failures.push({ name: 'submit_privacy', status: submitted.response.status }); return; }
      completedFlows++;
    } catch (error) { failures.push({ name: 'student_flow', message: error.message }); }
  }));
  const wallMs = performance.now() - overallStart;
  const summary = { mode: 'MongoMemoryServer local flow test (not Atlas/production capacity certification)', concurrentStudents: vus, completedFlows, errors: failures.length, wallTimeMs: Math.round(wallMs * 100) / 100, requestLatencyMs: Object.fromEntries([...latencies].map(([name, values]) => [name, { count: values.length, p50: percentile(values, .5), p95: percentile(values, .95), max: Math.round(Math.max(...values) * 100) / 100 }])), failures: failures.slice(0, 15) };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) process.exitCode = 1;
  await new Promise((resolve) => server.close(resolve));
}
try { await run(); }
finally { await mongoose.disconnect(); await memory.stop(); }
