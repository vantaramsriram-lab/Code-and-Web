import { useState } from 'react';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand.jsx';
import api from '../services/api.js';
import { displayError } from '../utils.js';
export default function AdminLogin() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const navigate = useNavigate();
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { await api.post('/admin/login', { email, password }); navigate('/admin'); } catch (err) { setError(displayError(err)); } finally { setBusy(false); } }
  return <main className="center-page"><div className="login-shell"><header className="topbar"><Brand/><Link className="admin-link" to="/"><ArrowLeft size={16}/> Student entry</Link></header><section className="login-card"><div className="login-icon"><LockKeyhole size={24}/></div><div className="eyebrow">RESTRICTED ACCESS</div><h1>Admin sign in</h1><p className="muted">Sign in to manage students, questions, settings and results.</p><form onSubmit={submit}><label htmlFor="email">Admin email</label><input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required/><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required/>{error && <div className="alert alert-error" role="alert">{error}</div>}<button className="button button-primary button-wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button></form><div className="small-note">Admin accounts are created privately by the server operator. There is no public registration.</div></section></div></main>;
}
