import { useEffect, useState } from 'react';
import { CalendarClock, Save, Play, Square, ShieldCheck } from 'lucide-react';
import api from '../../services/api.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import Loading from '../../components/Loading.jsx';
import { displayError, formatIst, fromIstInput, toIstInput } from '../../utils.js';
export default function SettingsPanel({ onChanged }) {
  const [quiz, setQuiz] = useState(null); const [form, setForm] = useState(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  async function load() { setLoading(true); try { const data = await api.get('/admin/quiz/settings'); setQuiz(data.quiz); setForm({ title: data.quiz.title, instructions: data.quiz.instructions, status: data.quiz.configuredStatus === 'draft' ? 'draft' : 'scheduled', startAt: toIstInput(data.quiz.startAt), endAt: toIstInput(data.quiz.endAt), resultsVisible: data.quiz.resultsVisible }); } catch (e) { setError(displayError(e)); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function save(e) { e.preventDefault(); setSaving(true); setError(''); setMessage(''); try { const result = await api.put('/admin/quiz/settings', { ...form, startAt: fromIstInput(form.startAt), endAt: fromIstInput(form.endAt) }); setMessage('Quiz settings saved. Times are stored in UTC and displayed in Asia/Kolkata.'); await load(); onChanged?.(); } catch (err) { setError(displayError(err)); } finally { setSaving(false); } }
  async function start() { setError(''); setMessage(''); try { await api.post('/admin/quiz/start'); setMessage('Quiz scheduled or started successfully.'); await load(); onChanged?.(); } catch (e) { setError(displayError(e)); } }
  async function close() { if (!window.confirm('Close the quiz now? Students will not be able to start or continue answering.')) return; setError(''); setMessage(''); try { await api.post('/admin/quiz/close'); setMessage('Quiz closed.'); await load(); onChanged?.(); } catch (e) { setError(displayError(e)); } }

  async function resetQuiz() {
    const confirmed = window.confirm(
      'Reset this quiz for another round? All previous attempts and results will be permanently deleted. Questions will be preserved.'
    );

    if (!confirmed) return;

    setError('');
    setMessage('');

    try {
      await api.post('/admin/quiz/reset');
      setMessage('Quiz reset. You can now edit questions and configure a new schedule.');
      await load();
      onChanged?.();
    } catch (err) {
      setError(displayError(err));
    }
  }

  if (loading || !form) return <Loading text="Loading quiz settings…" />;
  const locked = quiz.locked;
  return <div className="section-stack"><section className="section-heading"><div><div className="eyebrow">SCHEDULING</div><h2>Set the quiz rhythm.</h2><p>Choose a title, instructions, and official start/end times for students.</p></div><StatusBadge status={quiz.status} /></section>{error && <div className="alert alert-error">{error}</div>}{message && <div className="alert alert-success">{message}</div>}<div className="settings-layout"><section className="panel-card settings-form-panel"><div className="panel-title"><div><div className="eyebrow">QUIZ CONFIGURATION</div><h3>Quiz details</h3></div><CalendarClock size={22} /></div>{locked && <div className="alert alert-warning"><ShieldCheck size={18} /> These settings lock after scheduling or when an attempt starts.</div>}<form onSubmit={save}><label htmlFor="quiz-title">Quiz title</label><input id="quiz-title" maxLength="160" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={locked} required /><label htmlFor="quiz-instructions">Instructions for students</label><textarea id="quiz-instructions" rows="5" maxLength="5000" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} disabled={locked} /><div className="datetime-grid"><div><label htmlFor="start-at">Official start <span className="optional">Asia/Kolkata</span></label><input id="start-at" type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} disabled={locked} required /></div><div><label htmlFor="end-at">Official end <span className="optional">Asia/Kolkata</span></label><input id="end-at" type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} disabled={locked} required /></div></div><label htmlFor="quiz-status">Configuration status</label><select id="quiz-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} disabled={locked}><option value="draft">Draft</option><option value="scheduled">Scheduled</option></select><p className="small-note">“Start quiz” below schedules it for the configured start time, or opens it immediately if that time has passed. Questions lock when it goes live.</p><button className="button button-primary" disabled={saving || locked}><Save size={17} />{saving ? 'Saving…' : 'Save settings'}</button></form></section><aside className="panel-card settings-side"><div className="eyebrow">PUBLISH</div><h3>Ready to open?</h3><p>Before launch, add at least one question and set a valid start and end time. Late joiners receive only the remaining time.</p><div className="schedule-summary"><div><span>Starts</span><b>{formatIst(quiz.startAt)}</b></div><div><span>Ends</span><b>{formatIst(quiz.endAt)}</b></div></div><button className="button button-dark button-wide" disabled={locked || quiz.status === 'closed'} onClick={start}><Play size={17} /> {quiz.status === 'scheduled' || quiz.status === 'live' ? 'Start / schedule quiz' : 'Start / schedule quiz'}</button><button className="button button-outline button-wide" disabled={quiz.status === 'closed'} onClick={close}><Square size={16} /> Close quiz</button>
    <button
      className="button button-outline button-wide"
      onClick={resetQuiz}
    >
      Reset for next round
    </button>
    <div className="small-note">Students never see scores or answer keys after submission. Results are restricted to admins.</div>
  </aside></div></div>;
}
