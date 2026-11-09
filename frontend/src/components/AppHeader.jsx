import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import Brand from "./Brand.jsx";

export default function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="app-header">
      <Brand />
      <nav className="header-actions" aria-label="Main navigation">
        {user ? (
          <>
            {user.role === "student" && (
              <>
                <Link to="/feedback">Feedback</Link>
                <Link to="/student/history">Dining history</Link>
                <Link to="/student/notifications">Notifications</Link>
                <Link to="/recipes">Kettle recipes</Link>
              </>
            )}
            <span className="header-user">{user.name}</span>
            <button className="button button-quiet" type="button" onClick={logout}>Sign out</button>
          </>
        ) : (
          <>
            <Link to="/login">Sign in</Link>
            <Link className="button button-primary button-small" to="/register">Create account</Link>
          </>
        )}
      </nav>
    </header>
  );
}
