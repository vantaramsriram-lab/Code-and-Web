import { Navigate, Route, Routes } from 'react-router-dom';
import StudentEntry from './pages/StudentEntry.jsx';
import QuizPage from './pages/QuizPage.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
export default function App() {
  return <Routes>
    <Route path="/" element={<StudentEntry />} />
    <Route path="/quiz" element={<QuizPage />} />
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route path="/admin/*" element={<AdminDashboard />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
