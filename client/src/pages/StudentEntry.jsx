import { useEffect, useState } from 'react';
import { ArrowRight, Clock3, ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import Brand from '../components/Brand.jsx';
import Loading from '../components/Loading.jsx';
import { displayError, formatIst } from '../utils.js';
export default function StudentEntry() {
  const [scholarNumber, setScholarNumber] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    let mounted = true;
    Promise.allSettled([api.get('/session'), api.get('/quiz/current')]).then(([session, q]) => {
      if (!mounted) return;
      if (session.status === 'fulfilled') {
        if (session.value.role === 'student') { navigate('/quiz', { replace: true }); return; }
        if (session.value.role === 'admin') { navigate('/admin', { replace: true }); return; }
      }
      if (q.status === 'fulfilled') setQuiz(q.value);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [navigate]);
  async function submit(event) {
    event.preventDefault(); setError('');
    const value = scholarNumber.trim();
    if (!value) { setError('Enter your scholar number to continue.'); return; }
    setBusy(true);
    try { await api.post('/student/entry', { scholarNumber: value }); navigate('/quiz'); }
    catch (e) { setError(displayError(e)); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="center-page"><Loading text="Getting the quiz ready…" /></main>;
  return <main className="entry-page">
    <header className="topbar"><Brand /><a className="admin-link" href="/admin/login">Admin sign in <ArrowRight size={16}/></a></header>
    <section className="entry-grid">
      <div className="entry-copy">
        <div className="eyebrow"><Sparkles size={16}/> SPARK CLUB · THINK SHARP</div>
        <h1>Ready to<br/><span>spark?</span></h1>
        <p className="lead">A little curiosity goes a long way. Sign in with your registered scholar number and take on the Spark Club quiz.</p>
        <div className="entry-note">
          <span className="note-icon flex items-center justify-center">
            <Clock3 size={20}  className="mt-2"/>
          </span>
        <div>
          <b>{quiz?.title || 'Spark Club Quiz'}</b>
          <span>
            {quiz?.state === 'live'
              ? 'The quiz is live now.'
              : quiz?.state === 'scheduled'
              ? `Starts ${formatIst(quiz?.startAt)}.`
              : quiz?.state === 'closed'
               ? 'This quiz is now closed.'
              : 'Your quiz schedule will appear here.'}
        </span>
      </div>
      </div>
        <div className="privacy-note"><ShieldCheck size={18}/><span>One attempt per student. Your identity is checked against the club’s active student list.</span></div>
      </div>
      <div className="entry-card">
        <div className="card-kicker">STUDENT ENTRY <span>01 / 01</span></div>
        <h2>Let’s get started.</h2><p className="muted">Use the scholar number registered with Spark Club.</p>
        <form onSubmit={submit} noValidate>
          <label htmlFor="scholarNumber">Scholar number</label>
          <input id="scholarNumber" name="scholarNumber" autoComplete="username" inputMode="text" value={scholarNumber} onChange={(e) => setScholarNumber(e.target.value)} placeholder="e.g. 26U020000" maxLength={40} required />
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button className="button button-primary button-wide" type="submit" disabled={busy}>{busy ? 'Checking…' : <>Continue to quiz <ArrowRight size={18}/></>}</button>
        </form>
        <p className="small-note">No student password needed. Scholar numbers are checked against an active registration.</p>
      </div>
    </section>
    <footer className="entry-footer"><span>✦ Make your mark.</span><span>SPARK CLUB · IIIT BHOPAL</span></footer>
  </main>;
}
