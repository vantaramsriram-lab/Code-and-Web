# Spark Club Quiz

A full-stack quiz application for Spark Club built with React/Vite, Express, and MongoDB/Mongoose. The repository/reference portal was inspected before implementation: this workspace was empty, and the reference project is a TanStack Start + Supabase registration portal with applicant records, not a quiz system. The quiz app reuses the reference sites’ warm off-white canvas, condensed bold display type, purple identity, lime/pink accents, and compact form style. Applicant exports from the reference repository were not copied.

## Features

- Passwordless student entry checked against an active MongoDB student; scholar numbers remain strings and preserve leading zeroes.
- Admin-only login, bcrypt password hashes, signed HTTP-only JWT cookie, role checks, login throttles, origin/CORS restrictions, Helmet, and server validation.
- Admin overview, student CRUD/search/filter/pagination, question editor/reordering/preview, quiz settings/scheduling, and results dashboard/export.
- Server-enforced quiz state and UTC deadlines; Asia/Kolkata time display; refresh-safe server-deadline countdown; autosaved targeted answers; idempotent manual, timeout, and tab-switch finalization.
- Server-only scoring and answer keys. Student quiz APIs and submission confirmation do not return scores or correct answers.
- CSV preview/confirm import, row-level validation and duplicate/existing checks, retry-safe upserts, 2 MB / 10,000-row safeguards, and downloadable formula-safe failure reports.
- Fictional fixtures in a separate development/test CSV; seed command refuses production and non-dedicated database names.

## Technology

- Client: React 18, Vite, React Router, Tailwind CSS v4, Axios, React Hook Form dependency, Zod dependency, Lucide icons.
- Server: Node.js ES modules, Express 5, Mongoose, MongoDB, Zod, bcryptjs, JWT, csv-parse/csv-stringify, Multer.
- Tests: Node test runner, MongoMemoryServer, Supertest. Optional k6 script plus a local isolated 150-user end-to-end test.

## Requirements

- Node.js 20+
- MongoDB 7+ recommended (local MongoDB or Atlas). The integration/load tests use an isolated ephemeral MongoMemoryServer and do not require your configured database.

## Install and configure

```bash
cp .env.example .env
npm install
```

Set `.env` values before starting. Generate a random JWT key of at least 32 characters (for example, `openssl rand -base64 48`). Example local MongoDB URI:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/spark_quiz_dev
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/spark_quiz_test
CLIENT_URL=http://localhost:5173
COOKIE_SECURE=false
```

For MongoDB Atlas, create a dedicated database user with access only to the intended quiz database, allow the server’s network, and set `MONGODB_URI` to its SRV connection string with the database name `spark_quiz_dev` for development. Keep `.env` private; it is ignored by Git. Do not use a production database URI for test seeding.

## Database indexes and first admin

The Mongoose schemas define the unique normalized student scholar-number index, unique admin email, one current quiz key, unique question ordering, and unique `{ quizId, studentId }` attempts. Server startup creates declared indexes idempotently. To create/check indexes separately:

```bash
npm run db:indexes
```

Create the first admin privately (there is no public admin registration): set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` of at least 14 characters in the environment, then run:

```bash
npm run create-admin
```

This command hashes the password with bcrypt. It creates or rotates the account for that email. For a deliberate production run, also set `CONFIRM_ADMIN_CREATE=true` for that command. Remove the bootstrap password from the environment after use and rotate it through the same private procedure when needed.

## Run the application

```bash
npm run dev
```

- Vite client: `http://localhost:5173`
- Express API: `http://localhost:5000/api`
- The Vite dev server proxies `/api` to the backend.

For deployment, use HTTPS and serve the client and API under the same site/origin (for example, reverse-proxy `/api` to Express). Set `NODE_ENV=production`, `COOKIE_SECURE=true`, a production `CLIENT_URL`, and a production-only `MONGODB_URI`/`JWT_SECRET`. The auth cookie is `HttpOnly`, `SameSite=Strict`, and secure in production. Do not expose the database or JWT secret to the browser.

## Admin workflow

Open `/admin/login`, sign in, then use the dashboard sections:

1. **Overview** — live counts from MongoDB.
2. **Students** — manually add/edit/activate/deactivate; search and paginate; use **Download CSV Template** or preview an import.
3. **Questions** — create/edit/delete, choose the correct option, reorder, and preview the student view. Equal scoring is fixed at 1 point per correct answer; there is no per-question marks field.
4. **Quiz settings** — set title, instructions, official times, save, then start/schedule or close. Input/display times use Asia/Kolkata; persisted timestamps are UTC. Add a question and valid start/end before launch. For safety, the question set is locked when the quiz is scheduled (stricter than waiting until the live instant) or an attempt begins.
5. **Results** — admin-only search, status filtering, score/name sorting, pagination, summary statistics, and CSV export. Score ties are ordered by submission time and then stable attempt ID; name sorting uses name, scholar number, then ID.

### Student import CSV

The template download is named `students_template.csv` and contains the requested fictional examples. Name and scholar number are required; email is optional. The template examples are not automatically inserted. Select a `.csv` file (up to 2 MB and 10,000 data rows), preview the records, then confirm. The backend re-parses and revalidates the file at confirmation. Duplicates within the file, invalid rows, pre-existing records, and concurrent duplicate-key races are counted and included in the failure report. Importing an active student does not create an attempt.

## Fictional test data (never production data)

Regenerate the 200 fictional records (`example.com` addresses and synthetic `99xxxx` scholar numbers):

```bash
npm run csv:testdata
```

Seed them into the dedicated local development database only:

```bash
npm run seed:test
```

The seed uses upserts, creates no attempts, refuses `NODE_ENV=production`, and refuses database names other than `spark_quiz_dev` (or `spark_quiz_test` when `NODE_ENV=test`). The fixture file is `test-data/students_test.csv`. Do not replace it with real student information.

## Tests and load checks

```bash
npm test
npm run test:integration
npm run load:local
```

- `npm test` exercises CSV structure, normalization, duplicates, retry logic, formula-safe reports, size limits, and seed safety.
- `npm run test:integration` starts a throwaway in-memory MongoDB and tests auth/role boundaries, student activation, one-attempt behavior, answer persistence, no answer-key/result leakage, server scoring, submission idempotency, tab-switch and expiry finalization, template response, and import retry behavior. It never connects to `.env`’s Mongo URI.
- `npm run load:local` runs 150 concurrent synthetic end-to-end student flows against an isolated in-memory MongoDB. The observed local run on 2026-10-14 completed **150/150 flows with 0 request errors** in **4.12 s** wall time. Request p95s were: student entry 3,612 ms; load quiz 179 ms; start attempt 200 ms; save answer 163 ms; submit 258 ms. These timings include this sandbox and an in-memory MongoDB and are a smoke/baseline only, **not** a certification of Atlas or production capacity.
- An optional `loadtest/quiz-flow.js` k6 script is available for a deployed/staged environment. With k6 installed, populate at least 150 active synthetic students numbered `990001`–`990150`, configure a live quiz with questions and a future end time, then run `BASE_URL=https://your-staging-host VUS=150 k6 run loadtest/quiz-flow.js`. Use a clean isolated staging database because attempts are one per student per quiz.

## API outline

- `POST /api/student/entry`, `GET /api/session`, `POST /api/logout`
- `GET /api/quiz/current`, `POST /api/quiz/attempt/start`, `GET /api/quiz/attempt/current`
- `PUT /api/quiz/attempt/:attemptId/answer`, `POST /api/quiz/attempt/:attemptId/submit`, `POST /api/quiz/attempt/:attemptId/violation`, `GET /api/quiz/attempt/:attemptId/confirmation`
- Admin: `/api/admin/login`, `/api/admin/dashboard`, `/api/admin/students`, `/api/admin/questions`, `/api/admin/quiz/settings`, `/api/admin/results` and their import/export actions.

Student routes never serialize the correct option or score. The attempt deadline, answers, status, and score are authoritative in MongoDB/server code, not local storage. Attempts are uniquely indexed per quiz and student. Answer revisions protect newer selections from delayed older requests. Finalization first claims the attempt, preventing further answer updates before server-side scoring.

## Security notes and known limitations

- A scholar number is an identifier, not a secret. This requested passwordless club-quiz flow only proves that the number exists in the active roster; it does not prove who entered it. Add OTP or another identity verification step if the consequences require stronger assurance.
- Visibility-change tab-switch detection is a deterrent, not cheat-proof. Browsers can suppress events, lose network connectivity, or be manipulated. The backend remains authoritative for deadlines, allowed answers, and one-attempt rules.
- SameSite cookies and Origin checks mitigate cross-site requests; always serve over HTTPS in production. Keep the web app and API same-site so the strict cookie works.
- Login rate limiting is process-local. For a multi-instance deployment, use a shared rate-limit store (for example Redis) and monitor lockouts. Student entry has both a per-scholar-number throttle and a higher per-IP ceiling to support a campus NAT with many different students.
- Real concurrency depends on MongoDB tier, network latency, indexes, and deployment sizing. Run the staged k6 script against the actual target before a high-stakes event.

## Reference/design notes

Both supplied Vercel references were reachable during implementation. The main site emphasizes “Search for Spark,” a warm paper-like light background, bold condensed headings, and restrained club colors; the staging site also linked to `/quiz`. The source repository itself is a TanStack/Supabase registration app; this project is a separate MERN implementation and does not migrate or reuse its applicant records/schema.
