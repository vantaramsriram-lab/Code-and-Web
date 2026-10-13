import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/spark_quiz_test';
process.env.JWT_SECRET ||= 'integration-test-secret-is-not-used-outside-tests-123456';
process.env.CLIENT_URL ||= 'http://localhost:5173';
const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongo = await MongoMemoryServer.create({ instance: { dbName: 'spark_quiz_test' } });
process.env.MONGODB_URI = mongo.getUri('spark_quiz_test');
const mongoose = (await import('mongoose')).default;
const bcrypt = (await import('bcryptjs')).default;
const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const Student = (await import('../../src/models/Student.js')).default;
const Admin = (await import('../../src/models/Admin.js')).default;
const Quiz = (await import('../../src/models/Quiz.js')).default;
const Question = (await import('../../src/models/Question.js')).default;
const Attempt = (await import('../../src/models/Attempt.js')).default;
const app = createApp();
let adminAgent;
let questionId;
const now = new Date();

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 5 });
  await Promise.all([Student, Admin, Quiz, Question, Attempt].map((m) => m.syncIndexes()));
  await Admin.create({ email: 'quiz-admin@example.com', passwordHash: await bcrypt.hash('test-admin-password-long-enough', 4) });
  await Quiz.create({ key: 'current', title: 'Integration Quiz', instructions: 'Think carefully.', status: 'live', startAt: new Date(now.getTime() - 60000), endAt: new Date(now.getTime() + 60 * 60000), lockedAt: null });
  const quiz = await Quiz.findOne({ key: 'current' });
  const question = await Question.create({ quizId: quiz._id, prompt: 'Which option is correct?', options: ['Option A', 'Option B'], correctOption: 1, order: 0 });
  questionId = String(question._id);
  await Student.create([
    { name: 'Fictional Active', scholarNumber: '000101', email: 'active@example.com', isActive: true },
    { name: 'Fictional Inactive', scholarNumber: '000102', email: 'inactive@example.com', isActive: false },
    { name: 'Tab Switch User', scholarNumber: '000103', email: 'tabs@example.com', isActive: true },
    { name: 'Expired User', scholarNumber: '000104', email: 'expired@example.com', isActive: true }
  ]);
  adminAgent = request.agent(app);
  const login = await adminAgent.post('/api/admin/login').send({ email: 'quiz-admin@example.com', password: 'test-admin-password-long-enough' });
  assert.equal(login.status, 200);
});

after(async () => { await mongoose.disconnect(); await mongo.stop(); });

test('auth, admin protections, quiz answer persistence, submission privacy, CSV workflow and finalization', async (t) => {
  await t.test('admin-only APIs reject anonymous and student sessions', async () => {
    assert.equal((await request(app).get('/api/admin/dashboard')).status, 401);
    const studentAgent = request.agent(app);
    assert.equal((await studentAgent.post('/api/student/entry').send({ scholarNumber: 'no-such-student' })).status, 401);
    assert.equal((await studentAgent.post('/api/student/entry').send({ scholarNumber: '000102' })).status, 401);
    await studentAgent.post('/api/student/entry').send({ scholarNumber: '000101' }).expect(200);
    await studentAgent.get('/api/admin/results').expect(403);
  });
  await t.test('scheduled and closed quizzes reject new attempts', async () => {
    const agent = request.agent(app);
    await agent.post('/api/student/entry').send({ scholarNumber: '000101' }).expect(200);
    const quiz = await Quiz.findOne({ key: 'current' });
    quiz.status = 'scheduled'; quiz.startAt = new Date(Date.now() + 60000); quiz.endAt = new Date(Date.now() + 120000); await quiz.save();
    await agent.post('/api/quiz/attempt/start').expect(409);
    quiz.status = 'live'; quiz.startAt = new Date(Date.now() - 60000); quiz.endAt = new Date(Date.now() - 1000); await quiz.save();
    await agent.post('/api/quiz/attempt/start').expect(409);
    quiz.status = 'live'; quiz.endAt = new Date(Date.now() + 60 * 60000); await quiz.save();
  });
  await t.test('active student starts one attempt, saves answers, refreshes, and only sees confirmation', async () => {
    const studentAgent = request.agent(app);
    await studentAgent.post('/api/student/entry').send({ scholarNumber: ' 000101 ' }).expect(200);
    const started = await studentAgent.post('/api/quiz/attempt/start').expect(201);
    const attempt = started.body.attempt;
    await adminAgent.put(`/api/admin/questions/${questionId}`).send({ prompt: 'Changed while live?', options: ['A', 'B'], correctOption: 1 }).expect(409);
    assert.equal(attempt.questions.length, 1);
    assert.equal(JSON.stringify(started.body).includes('correctOption'), false);
    assert.equal(JSON.stringify(started.body).includes('score'), false);
    await studentAgent.put(`/api/quiz/attempt/${attempt.id}/answer`).send({ questionId, selectedOption: 1, revision: 1 }).expect(200);
    await studentAgent.put(`/api/quiz/attempt/${attempt.id}/answer`).send({ questionId, selectedOption: 0, revision: 2 }).expect(200);
    const stale = await studentAgent.put(`/api/quiz/attempt/${attempt.id}/answer`).send({ questionId, selectedOption: 1, revision: 1 }).expect(200);
    assert.equal(stale.body.selectedOption, 0);
    const restored = await studentAgent.get('/api/quiz/attempt/current').expect(200);
    assert.equal(restored.body.attempt.answers[questionId], 0);
    assert.equal(restored.body.attempt.answerRevisions[questionId], 2);
    await studentAgent.put(`/api/quiz/attempt/${attempt.id}/answer`).send({ questionId, selectedOption: 1, revision: 3 }).expect(200);
    const secondStart = await studentAgent.post('/api/quiz/attempt/start').expect(200);
    assert.equal(secondStart.body.attempt.id, attempt.id);
    const submitted = await studentAgent.post(`/api/quiz/attempt/${attempt.id}/submit`).expect(200);
    assert.match(submitted.body.message, /submitted successfully/i);
    assert.equal('score' in submitted.body, false);
    assert.equal('answers' in submitted.body, false);
    const again = await studentAgent.post(`/api/quiz/attempt/${attempt.id}/submit`).expect(200);
    assert.equal(again.body.submittedAt, submitted.body.submittedAt);
    assert.equal(JSON.stringify(await studentAgent.get(`/api/quiz/attempt/${attempt.id}/confirmation`)).includes('score'), false);
    const stored = await Attempt.findById(attempt.id).lean();
    assert.equal(stored.score, 1);
    const results = await adminAgent.get('/api/admin/results').expect(200);
    assert.equal(results.body.rows.find((r) => r.id === attempt.id).correctAnswers, 1);
  });
  await t.test('tab-switch violation finalizes idempotently and rejects later answers', async () => {
    const agent = request.agent(app);
    await agent.post('/api/student/entry').send({ scholarNumber: '000103' }).expect(200);
    const { body } = await agent.post('/api/quiz/attempt/start').expect(201);
    const violation = await agent.post(`/api/quiz/attempt/${body.attempt.id}/violation`).expect(200);
    assert.equal(violation.body.status, 'auto_submitted');
    await agent.put(`/api/quiz/attempt/${body.attempt.id}/answer`).send({ questionId, selectedOption: 0, revision: 1 }).expect(409);
    const repeated = await agent.post(`/api/quiz/attempt/${body.attempt.id}/violation`).expect(200);
    assert.equal(repeated.body.status, 'auto_submitted');
    assert.equal((await Attempt.findById(body.attempt.id)).violationReason, 'prohibited_tab_switch');
  });
  await t.test('expired attempts cannot be updated and are finalized as expired', async () => {
    const agent = request.agent(app);
    await agent.post('/api/student/entry').send({ scholarNumber: '000104' }).expect(200);
    const { body } = await agent.post('/api/quiz/attempt/start').expect(201);
    await Attempt.updateOne({ _id: body.attempt.id }, { $set: { deadlineAt: new Date(Date.now() - 1000) } });
    await agent.put(`/api/quiz/attempt/${body.attempt.id}/answer`).send({ questionId, selectedOption: 0, revision: 1 }).expect(409);
    assert.equal((await Attempt.findById(body.attempt.id)).status, 'expired');
  });
  await t.test('CSV preview, import, retry, duplicate handling, template, and leading zeroes', async () => {
    const csv = 'name,scholarNumber,email\nCSV Fictional,000501,csv@example.com\n,000502,invalid@example.com\nRepeat First,000503,first@example.com\nRepeat Second,000503,second@example.com\n';
    const preview = await adminAgent.post('/api/admin/students/import').attach('file', Buffer.from(csv), 'students.csv').field('mode', 'preview').expect(200);
    assert.equal(preview.body.totalRows, 4); assert.equal(preview.body.validRows, 2); assert.equal(preview.body.duplicateSkipped, 1); assert.equal(preview.body.invalidRows, 1);
    const imported = await adminAgent.post('/api/admin/students/import').attach('file', Buffer.from(csv), 'students.csv').field('mode', 'commit').expect(200);
    assert.equal(imported.body.summary.successfullyImported, 2); assert.equal(imported.body.summary.duplicateRowsSkipped, 1); assert.equal(imported.body.summary.invalidRowsRejected, 1);
    assert.equal((await Student.findOne({ scholarNumber: '000501' })).name, 'CSV Fictional');
    const retry = await adminAgent.post('/api/admin/students/import').attach('file', Buffer.from(csv), 'students.csv').field('mode', 'commit').expect(200);
    assert.equal(retry.body.summary.successfullyImported, 0); assert.equal(retry.body.summary.existingRecordsSkipped, 2);
    const missing = await adminAgent.post('/api/admin/students/import').attach('file', Buffer.from('name,email\nNo Number,x@example.com'), 'bad.csv').field('mode', 'preview').expect(400);
    assert.match(missing.body.message, /missing required column/i);
    const template = await adminAgent.get('/api/admin/students/import-template').expect(200);
    assert.match(template.headers['content-disposition'], /students_template\.csv/); assert.match(template.text, /Rahul Sharma,240001/);
  });
});
