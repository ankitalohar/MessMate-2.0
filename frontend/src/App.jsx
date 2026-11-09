import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import HomePage from "./pages/HomePage.jsx";
import FeedbackPage from "./pages/FeedbackPage.jsx";
import DiningHistoryPage from "./pages/DiningHistoryPage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import RecipesPage from "./pages/RecipesPage.jsx";
import StudentDashboard from "./pages/StudentDashboard.jsx";

function RoleRoute({ role, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) {
    return <Navigate to={user.role === "admin" ? "/admin" : "/student"} replace />;
  }
  return children;
}

function AuthRoute({ children }) {
  const { user } = useAuth();
  if (!user) return children;
  return <Navigate to={user.role === "admin" ? "/admin" : "/student"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute><RegisterPage /></AuthRoute>} />
      <Route
        path="/student"
        element={<RoleRoute role="student"><StudentDashboard /></RoleRoute>}
      />
      <Route path="/recipes" element={<RoleRoute role="student"><RecipesPage /></RoleRoute>} />
      <Route path="/feedback" element={<RoleRoute role="student"><FeedbackPage /></RoleRoute>} />
      <Route path="/student/history" element={<RoleRoute role="student"><DiningHistoryPage /></RoleRoute>} />
      <Route path="/student/notifications" element={<RoleRoute role="student"><NotificationsPage /></RoleRoute>} />
      <Route
        path="/admin"
        element={<RoleRoute role="admin"><AdminDashboard /></RoleRoute>}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
