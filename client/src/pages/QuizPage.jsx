import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Clock3, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import Brand from '../components/Brand.jsx';
import Loading from '../components/Loading.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { displayError, formatIst } from '../utils.js';
function timerText(ms) { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
export default function QuizPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true); const [student, setStudent] = useState(null); const [quiz, setQuiz] = useState(null); const [attempt, setAttempt] = useState(null);
  const [current, setCurrent] = useState(0); const [answers, setAnswers] = useState({}); const [saveStates, setSaveStates] = useState({}); const [remaining, setRemaining] = useState(null);
  const [dialog, setDialog] = useState(false); const [error, setError] = useState(''); const [confirmation, setConfirmation] = useState(null); const [starting, setStarting] = useState(false);
  const revisions = useRef({}); const latest = useRef({}); const serverOffset = useRef(0); const expirySent = useRef(false); const lastQuizState = useRef(null);
  const refresh = useCallback(async () => {
    try {
      const session = await api.get('/session');
      if (session.role !== 'student') { navigate(session.role === 'admin' ? '/admin' : '/', { replace: true }); return; }
      setStudent(session.student);
      const [q, a] = await Promise.all([api.get('/quiz/current'), api.get('/quiz/attempt/current')]);
      if (a.serverNow) serverOffset.current = new Date(a.serverNow).getTime() - Date.now();
      lastQuizState.current = q.state; setQuiz(q); setAttempt(a.attempt || null);
      if (a.attempt) { setAnswers(a.attempt.answers || {}); revisions.current = a.attempt.answerRevisions || {}; latest.current = Object.fromEntries(Object.entries(a.attempt.answers || {}).map(([qid, option]) => [qid, { option, revision: revisions.current[qid] || 0 }])); setConfirmation(a.attempt.status === 'in_progress' ? null : { status: a.attempt.status, submittedAt: a.attempt.submittedAt, reference: String(a.attempt.id).slice(-8).toUpperCase() }); } else { setAttempt(null); setAnswers({}); setConfirmation(null); revisions.current = {}; latest.current = {}; }
      setError('');
    } catch (err) { if (/sign in|session/i.test(err.message)) navigate('/', { replace: true }); else setError(displayError(err)); }
    finally { setLoading(false); }
  }, [navigate]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!attempt?.deadlineAt || attempt.status !== 'in_progress' || quiz?.state === 'paused') return; const tick = () => setRemaining(new Date(attempt.deadlineAt).getTime() - (Date.now() + serverOffset.current)); tick(); const id = setInterval(tick, 1000); return () => clearInterval(id); }, [attempt?.deadlineAt, attempt?.status, quiz?.state]);
  useEffect(() => {
    if (!attempt?.id || attempt.status !== 'in_progress') return;
    let alive = true;
    const poll = async () => {
      try {
        const nextQuiz = await api.get('/quiz/current');
        if (!alive) return;
        const wasPaused = lastQuizState.current === 'paused';
        if (wasPaused && nextQuiz.state !== 'paused') {
          const restored = await api.get('/quiz/attempt/current');
          if (!alive) return;
          if (restored.serverNow) serverOffset.current = new Date(restored.serverNow).getTime() - Date.now();
          if (restored.attempt) setAttempt((old) => old ? { ...old, deadlineAt: restored.attempt.deadlineAt, status: restored.attempt.status } : old);
        }
        lastQuizState.current = nextQuiz.state;
        setQuiz(nextQuiz);
      } catch { /* Keep the last known state during temporary network failures. */ }
    };
    const id = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [attempt?.id, attempt?.status]);
  const finalizeAtTimeout = useCallback(async () => { if (!attempt?.id || expirySent.current) return; expirySent.current = true; try { const result = await api.post(`/quiz/attempt/${attempt.id}/submit`); setConfirmation(result); setAttempt((a) => ({ ...a, status: result.status, submittedAt: result.submittedAt })); } catch (err) { setError(displayError(err)); expirySent.current = false; } }, [attempt?.id]);
  useEffect(() => { if (remaining !== null && remaining <= 0 && attempt?.status === 'in_progress') finalizeAtTimeout(); }, [remaining, attempt?.status, finalizeAtTimeout]);
  async function startAttempt() {
    setStarting(true); setError('');
    try { const result = await api.post('/quiz/attempt/start'); if (result.attempt.serverNow) serverOffset.current = new Date(result.attempt.serverNow).getTime() - Date.now(); setAttempt(result.attempt); setAnswers(result.attempt.answers || {}); setCurrent(0); revisions.current = {}; latest.current = {}; expirySent.current = false; }
    catch (err) { setError(displayError(err)); await refresh(); }
    finally { setStarting(false); }
  }
  async function saveAnswer(question, option) {
    if (!attempt?.id || attempt.status !== 'in_progress' || quiz?.state === 'paused') return;
    const qid = question.id; const revision = (revisions.current[qid] || 0) + 1; revisions.current[qid] = revision; latest.current[qid] = { option, revision };
    setAnswers((old) => ({ ...old, [qid]: option })); setSaveStates((old) => ({ ...old, [qid]: { status: 'saving', revision } }));
    try {
      const saved = await api.put(`/quiz/attempt/${attempt.id}/answer`, { questionId: qid, selectedOption: option, revision });
      if (revisions.current[qid] === revision) { setAnswers((old) => ({ ...old, [qid]: saved.selectedOption })); setSaveStates((old) => ({ ...old, [qid]: { status: 'saved', revision } })); }
    } catch (err) { if (revisions.current[qid] === revision) setSaveStates((old) => ({ ...old, [qid]: { status: 'error', revision, message: displayError(err) } })); }
  }
  async function retryAnswer(qid) { const pending = latest.current[qid]; const question = attempt.questions.find((q) => q.id === qid); if (pending && question) await saveAnswer(question, pending.option); }
  async function submitFinal() {
    setDialog(false); setError('');
    if (Object.values(saveStates).some((s) => s.status === 'saving' || s.status === 'error')) { setError('Wait for every answer to save, or retry a failed save, before submitting.'); return; }
    try { const result = await api.post(`/quiz/attempt/${attempt.id}/submit`); setConfirmation(result); setAttempt((a) => ({ ...a, status: result.status, submittedAt: result.submittedAt })); }
    catch (err) { setError(displayError(err)); }
  }
  async function logout() { try { await api.post('/logout'); } finally { navigate('/', { replace: true }); } }
  const questions = attempt?.questions || [];
  const answeredCount = useMemo(() => questions.filter((q) => answers[q.id] !== undefined).length, [questions, answers]);
  if (loading) return <main className="center-page"><Loading text="Restoring your quiz…" /></main>;
  const isActive = attempt?.status === 'in_progress' && !confirmation;
  if (confirmation) return <main className="center-page"><section className="confirmation-card"><Brand /><div className="confirm-mark"><Check size={36} /></div><div className="eyebrow">RESPONSE RECORDED</div><h1>Your quiz is complete.</h1><p className="lead">Your quiz has been submitted successfully. Your responses have been recorded. Thank you for participating.</p><div className="confirmation-meta"><span>Submitted</span><b>{formatIst(confirmation.submittedAt)}</b></div><div className="confirmation-meta"><span>Reference</span><b>{confirmation.reference || '—'}</b></div><p className="small-note">Your result is not shown here. Thank you for taking part in Spark Club.</p><button className="button button-primary" onClick={refresh}>Check for retake</button><button className="button button-outline" onClick={logout}><LogOut size={17} /> Sign out</button></section></main>;
  if (attempt && attempt.status !== 'in_progress') return <main className="center-page"><section className="confirmation-card"><Brand /><div className="eyebrow">ATTEMPT CLOSED</div><h1>This attempt is finalized.</h1><p className="lead">Your responses have been recorded. If an administrator approves a retake, your previous attempt will be cleared. Refresh this page to check whether you can start again.</p><button className="button button-primary" onClick={refresh}>Check again</button><button className="button button-outline" onClick={logout}><LogOut size={17} /> Sign out</button></section></main>;
  if (!attempt) return <main className="entry-page"><header className="topbar"><Brand /><button className="button button-ghost" onClick={logout}><LogOut size={16} /> Sign out</button></header><section className="start-card"><div className="eyebrow">WELCOME, {student?.name?.toUpperCase() || 'STUDENT'}</div><h1>{quiz?.title || 'Spark Club Quiz'}</h1><p className="lead">{quiz?.instructions}</p><div className="start-details"><div><span>Quiz status</span><StatusBadge status={quiz?.state} /></div><div><span>Questions</span><b>{quiz?.questionCount ?? '—'}</b></div><div><span>Closes</span><b>{formatIst(quiz?.endAt)}</b></div></div>{error && <div className="alert alert-error" role="alert">{error}</div>}{quiz?.state === 'live' ? <button className="button button-primary" onClick={startAttempt} disabled={starting}>{starting ? 'Starting…' : <>Start quiz <ArrowRight size={18} /></>}</button> : <p className="muted">{quiz?.state === 'scheduled' ? `The quiz opens at ${formatIst(quiz?.startAt)}. Refresh this page when it begins.` : quiz?.state === 'closed' ? 'The quiz is closed and is no longer accepting attempts.' : 'The quiz has not been scheduled yet. Check back later.'}</p>}<p className="small-note">One attempt by default. An administrator may approve a retake. Each attempt has its own countdown.</p></section></main>;
  if (!isActive) return <main className="center-page"><Loading text="Finishing your attempt…" /></main>;
  const question = questions[current]; const saveState = saveStates[question?.id]; const remainingText = timerText(remaining ?? 0);
  return <main className="quiz-shell" onContextMenu={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
    <header className="quiz-header"><Brand compact /><div className={`timer ${remaining <= 60000 ? 'timer-warning' : ''}`} aria-live="polite"><Clock3 size={18} /><span><small>TIME LEFT</small><b>{remainingText}</b></span></div><div className="student-chip"><span>{student?.name}</span><button aria-label="Sign out" className="icon-button" onClick={logout}><LogOut size={17} /></button></div></header>
    {quiz?.state === 'paused' && <div className="alert alert-warning" role="status">The quiz is paused by the administrator. Your timer is temporarily stopped; please stay on this page.</div>}{remaining <= 60000 && quiz?.state !== 'paused' && <div className="low-time" role="status">Less than one minute remaining. Your answers are saved automatically.</div>}
    <div className="quiz-progress"><div><span>{quiz?.title}</span><span>{answeredCount} of {questions.length} answered</span></div><div className="progress-track"><div style={{ width: `${questions.length ? answeredCount / questions.length * 100 : 0}%` }} /></div></div>
    <div className="quiz-layout"><aside className="question-nav"><h2>Questions</h2><p>Choose a number to jump to it.</p><div className="question-grid">{questions.map((q, i) => <button key={q.id} className={`question-dot ${i === current ? 'is-current' : ''} ${answers[q.id] !== undefined ? 'is-answered' : ''}`} onClick={() => setCurrent(i)} aria-label={`Question ${i + 1}${answers[q.id] !== undefined ? ', answered' : ', unanswered'}`}>{answers[q.id] !== undefined ? <Check size={16} className="ml-2"/> : String(i + 1).padStart(2, '0')}</button>)}</div><div className="legend"><span><i className="legend-current" />Current</span><span><i className="legend-answered" />Answered</span><span><i />Unanswered</span></div><div className="quiz-privacy"><ShieldCheck size={18} /> Your responses are saved securely as you go.</div></aside>
      <section className="question-card"><div className="question-card-top"><span>QUESTION {String(current + 1).padStart(2, '0')} <i> / {String(questions.length).padStart(2, '0')}</i></span><span className={`save-indicator ${saveState?.status || ''}`} aria-live="polite">{saveState?.status === 'saving' ? 'Saving…' : saveState?.status === 'saved' ? 'Saved' : saveState?.status === 'error' ? 'Not saved' : 'Select an answer'}</span></div><h1 className="question-multiline">{question?.prompt}</h1><div className="option-list" role="radiogroup" aria-label="Answer options">{question?.options.map((option, i) => <button key={i} role="radio" aria-checked={answers[question.id] === i} className={`answer-option ${answers[question.id] === i ? 'selected' : ''}`} disabled={quiz?.state === 'paused'} onClick={() => saveAnswer(question, i)}><span className="option-letter">{String.fromCharCode(65 + i)}</span><span>{option}</span>{answers[question.id] === i && <Check size={19} />}</button>)}</div>{saveState?.status === 'error' && <div className="alert alert-error save-error">{saveState.message} <button className="text-button" onClick={() => retryAnswer(question.id)}>Retry saving</button></div>}<div className="question-controls"><button className="button button-outline" disabled={current === 0} onClick={() => setCurrent((v) => Math.max(0, v - 1))}><ChevronLeft size={18} /> Previous</button><button className="button button-dark" disabled={current === questions.length - 1} onClick={() => setCurrent((v) => Math.min(questions.length - 1, v + 1))}>Next <ChevronRight size={18} /></button></div></section>
    </div><footer className="quiz-footer"><span>✦ Think clearly. Trust your spark.</span><button className="button button-primary" disabled={quiz?.state === 'paused'} onClick={() => setDialog(true)}><Check size={17} /> Submit quiz</button></footer>
    {error && <div className="toast-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
    {dialog && <div className="modal-backdrop" role="presentation"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="submit-title"><div className="eyebrow">FINAL CHECK</div><h2 id="submit-title">Submit your quiz?</h2><p>Your submission is final. You have answered {answeredCount} of {questions.length} questions. Unanswered questions will receive no response.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setDialog(false)}>Keep checking</button><button className="button button-primary" onClick={submitFinal}>Submit</button></div></section></div>}
  </main>;
}
