import { Trend } from 'k6/metrics';
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
const loginDuration = new Trend('login_duration');
const quizLoadDuration = new Trend('quiz_load_duration');
const attemptStartDuration = new Trend('attempt_start_duration');
const answerSaveDuration = new Trend('answer_save_duration');
const submitDuration = new Trend('submit_duration');
const BASE_URL = (
  __ENV.BASE_URL || 'https://code-and-web.onrender.com'
).replace(/\/$/, '');

const VUS = Number(__ENV.VUS || 5);

const scholars = new SharedArray('scholars', () => {
  return open('./scholars.csv')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
});

export const options = {
  scenarios: {
    student_quiz: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '5m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

export default function () {
  const scholarNumber = scholars[__VU - 1];

  if (!scholarNumber) {
    throw new Error(`Missing scholar number for VU ${__VU}`);
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  // 1. Log in with the scholar number.
  const login = http.post(
    `${BASE_URL}/api/student/entry`,
    JSON.stringify({ scholarNumber }),
    {
      headers,
      tags: { endpoint: 'student_entry' },
    }
  );

  loginDuration.add(login.timings.duration);

  if (!check(login, {
    'student login successful': (r) => r.status === 200,
  })) {
    console.error(
      `Login failed for VU ${__VU}: ${login.status} ${login.body}`
    );
    return;
  }

  
  // k6 maintains a separate cookie jar for each virtual user.
  // The login session cookie is sent automatically.

  // 2. Load the current quiz.
  const current = http.get(
    `${BASE_URL}/api/quiz/current`,
    { tags: { endpoint: 'quiz_current' } }
  );

  quizLoadDuration.add(current.timings.duration)

  if (!check(current, {
    'quiz loaded': (r) => r.status === 200,
  })) {
    console.error(`Quiz load failed: ${current.status}`);
    return;
  }



  // 3. Start the attempt.
  const start = http.post(
    `${BASE_URL}/api/quiz/attempt/start`,
    null,
    {
      headers,
      tags: { endpoint: 'attempt_start' },
    }
  );
  attemptStartDuration.add(start.timings.duration)

  if (!check(start, {
    'attempt started': (r) =>
      r.status === 200 || r.status === 201,
  })) {
    console.error(
      `Attempt start failed for VU ${__VU}: ${start.status} ${start.body}`
    );
    return;
  }

  const attempt = start.json('attempt');

  if (!attempt?.id || !Array.isArray(attempt.questions)) {
    console.error(`Invalid attempt response for VU ${__VU}`);
    return;
  }

  

  // 4. Save one valid option for every question.
  for (const question of attempt.questions) {
    if (!question.id || !question.options?.length) {
      console.error(`Invalid question in VU ${__VU}'s attempt`);
      return;
    }

    const answer = http.put(
      `${BASE_URL}/api/quiz/attempt/${attempt.id}/answer`,
      JSON.stringify({
        questionId: question.id,
        selectedOption: 0,
        revision: 1,
      }),
      {
        headers,
        tags: { endpoint: 'save_answer' },
      }
    );
     answerSaveDuration.add(answer.timings.duration)

    if (!check(answer, {
      'answer saved': (r) => r.status === 200,
    })) {
      console.error(
        `Answer failed for VU ${__VU}: ${answer.status} ${answer.body}`
      );
      return;
    }
   
  }
  

  // 5. Submit the attempt.
  // This finalizes the student's attempt permanently.
  const submit = http.post(
    `${BASE_URL}/api/quiz/attempt/${attempt.id}/submit`,
    null,
    {
      headers,
      tags: { endpoint: 'submit_attempt' },
    }
  );
  
  submitDuration.add(submit.timings.duration)

  check(submit, {
    'quiz submitted': (r) => r.status === 200,
  });

  if (submit.status !== 200) {
    console.error(
      `Submission failed for VU ${__VU}: ${submit.status} ${submit.body}`
    );
  }
  
}
