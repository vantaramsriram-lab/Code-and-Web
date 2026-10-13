import { useEffect, useMemo, useState } from 'react';
import { Activity, BookOpenCheck, CalendarClock, ChevronRight, ClipboardList, LayoutDashboard, LogOut, Settings2, UsersRound, Trophy, Menu, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import Brand from '../components/Brand.jsx';
import Loading from '../components/Loading.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatIst, displayError } from '../utils.js';
import StudentManagement from './admin/StudentManagement.jsx';
import QuestionsPanel from './admin/QuestionsPanel.jsx';
import SettingsPanel from './admin/SettingsPanel.jsx';
import ResultsPanel from './admin/ResultsPanel.jsx';
const navItems = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/admin' },
  { key: 'students', label: 'Students', icon: UsersRound, path: '/admin/students' },
  { key: 'questions', label: 'Questions', icon: BookOpenCheck, path: '/admin/questions' },
  { key: 'settings', label: 'Quiz settings', icon: Settings2, path: '/admin/settings' },
  { key: 'results', label: 'Results', icon: Trophy, path: '/admin/results' }
];
export default function AdminDashboard() {
  const [admin, setAdmin] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [mobileOpen, setMobileOpen] = useState(false); const [overview, setOverview] = useState(null); const [refreshKey, setRefreshKey] = useState(0);
  const location = useLocation(); const navigate = useNavigate();
  const active = useMemo(() => navItems.find((n) => n.path === location.pathname)?.key || (location.pathname.startsWith('/admin/students') ? 'students' : location.pathname.startsWith('/admin/questions') ? 'questions' : location.pathname.startsWith('/admin/settings') ? 'settings' : location.pathname.startsWith('/admin/results') ? 'results' : 'overview'), [location.pathname]);
  useEffect(() => { let alive = true; api.get('/session').then((data) => { if (!alive) return; if (data.role !== 'admin') { navigate(data.role === 'student' ? '/quiz' : '/admin/login', { replace: true }); return; } setAdmin(data.admin); }).catch(() => navigate('/admin/login', { replace: true })).finally(() => alive && setLoading(false)); return () => { alive = false; }; }, [navigate]);
  useEffect(() => { if (admin) api.get('/admin/dashboard').then(setOverview).catch((e) => setError(displayError(e))); }, [admin, refreshKey]);
  async function logout() { try { await api.post('/logout'); } finally { navigate('/admin/login', { replace: true }); } }
  const sectionNames = { overview: 'Overview', students: 'Student management', questions: 'Question management', settings: 'Quiz settings', results: 'Quiz results' };
  if (loading) return <main className="center-page"><Loading text="Verifying admin session…"/></main>;
  if (!admin) return <main className="center-page"><Loading/></main>;
  return <div className="admin-layout"><aside className={`admin-sidebar ${mobileOpen ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><Brand compact/><button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X/></button></div><div className="sidebar-label">WORKSPACE</div><nav>{navItems.map(({ key, label, icon: Icon, path }) => <Link key={key} to={path} onClick={() => setMobileOpen(false)} className={`sidebar-link ${active === key ? 'active' : ''}`}><Icon size={19}/><span>{label}</span>{active === key && <ChevronRight size={16}/>}</Link>)}</nav><div className="sidebar-bottom"><div className="admin-profile"><span className="avatar">{admin.email?.[0]?.toUpperCase() || 'A'}</span><span><b>Administrator</b><small>{admin.email}</small></span></div><button className="sidebar-link sidebar-logout" onClick={logout}><LogOut size={18}/> Sign out</button><Link className="sidebar-student" to="/">Student portal <ChevronRight size={15}/></Link></div></aside>
    {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation"/>}
    <main className="admin-main"><header className="admin-topbar"><button className="icon-button menu-open" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu/></button><div><div className="eyebrow">SPARK CLUB · ADMIN</div><h1>{sectionNames[active]}</h1></div><div className="topbar-right"><span className="admin-top-email">{admin.email}</span><StatusBadge status={overview?.quiz?.status || 'draft'}/></div></header>
      <div className="admin-content">{error && <div className="alert alert-error">{error}<button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
        {active === 'overview' && <Overview data={overview} onNavigate={(path) => navigate(path)}/>}
        {active === 'students' && <StudentManagement onChanged={() => setRefreshKey((v) => v + 1)}/>}
        {active === 'questions' && <QuestionsPanel onChanged={() => setRefreshKey((v) => v + 1)}/>}
        {active === 'settings' && <SettingsPanel onChanged={() => setRefreshKey((v) => v + 1)}/>}
        {active === 'results' && <ResultsPanel/>}
      </div><footer className="admin-footer"><span>✦ Spark Club Quiz</span><span>All times shown in Asia/Kolkata · Server timestamps stored in UTC</span></footer>
    </main></div>;
}
function Overview({ data, onNavigate }) {
  if (!data) return <Loading text="Loading live dashboard data…"/>;
  const metrics = [
    { title: 'Active students', value: data.counts.registeredStudents, note: 'Eligible to take the quiz', icon: UsersRound, tone: 'purple' },
    { title: 'Quiz attempts', value: data.counts.attempts, note: 'Started attempts', icon: Activity, tone: 'pink' },
    { title: 'Submitted', value: data.counts.submittedAttempts, note: 'Finalized responses', icon: ClipboardList, tone: 'lime' },
    { title: 'Not attempted', value: data.counts.notAttempted, note: 'Active students remaining', icon: CalendarClock, tone: 'paper' }
  ];
  return <><section className="overview-welcome"><div><div className="eyebrow">GOOD TO SEE YOU</div><h2>Let’s make this quiz <span>spark.</span></h2><p>Here’s the latest from your quiz workspace.</p></div><button className="button button-dark" onClick={() => onNavigate('/admin/settings')}><Settings2 size={17}/> Quiz settings</button></section><div className="metric-grid">{metrics.map(({ title, value, note, icon: Icon, tone }) => <article className="metric-card" key={title}><div className={`metric-icon ${tone}`}><Icon size={20}/></div><span>{title}</span><b>{Number(value || 0).toLocaleString('en-IN')}</b><small>{note}</small></article>)}</div><div className="overview-bottom"><section className="panel-card current-quiz"><div className="panel-title"><div><div className="eyebrow">CURRENT QUIZ</div><h3>{data.quiz.title}</h3></div><StatusBadge status={data.quiz.status}/></div><div className="quiz-detail-row"><div><span>Official start</span><b>{formatIst(data.quiz.startAt)}</b></div><div><span>Official end</span><b>{formatIst(data.quiz.endAt)}</b></div><div><span>Questions</span><b>{data.counts.questions}</b></div></div><div className="panel-actions"><button className="text-link" onClick={() => onNavigate('/admin/questions')}>Manage questions <ChevronRight size={15}/></button><button className="text-link" onClick={() => onNavigate('/admin/results')}>Open results <ChevronRight size={15}/></button></div></section><section className="panel-card quick-actions"><div className="eyebrow">QUICK ACTIONS</div><h3>Keep things moving.</h3><button className="quick-action" onClick={() => onNavigate('/admin/students')}><span className="quick-icon"><UsersRound size={18}/></span><span><b>Manage students</b><small>Add, edit or import student records.</small></span><ChevronRight size={18}/></button><button className="quick-action" onClick={() => onNavigate('/admin/questions')}><span className="quick-icon"><BookOpenCheck size={18}/></span><span><b>Build the question set</b><small>Create and preview your questions.</small></span><ChevronRight size={18}/></button></section></div></>;
}
