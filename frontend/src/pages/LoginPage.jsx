import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  hasGietStudentEmailDomain,
  isValidEmailFormat,
  normalizeEmail,
  STUDENT_LOGIN_EMAIL_ERROR,
} from "../auth/email.js";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState("student");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const normalizedEmail = normalizeEmail(form.get("email"));
    setEmail(normalizedEmail);
    if (role === "student" && !hasGietStudentEmailDomain(normalizedEmail)) {
      setError(STUDENT_LOGIN_EMAIL_ERROR);
      return;
    }
    if (!isValidEmailFormat(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    event.currentTarget.elements.email.value = normalizedEmail;
    if (!event.currentTarget.reportValidity()) return;
    setSubmitting(true);
    try {
      const user = await login({
        email: normalizedEmail,
        password: form.get("password"),
        role,
      });
      const requestedPath = location.state?.from;
      navigate(
        requestedPath || (user.role === "admin" ? "/admin" : "/student"),
        { replace: true }
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="WELCOME BACK"
      title="Sign in to MessMate"
      description="Choose your account type to continue to your dining dashboard."
      footer={<>New to MessMate? <Link to="/register">Create an account</Link></>}
    >
      <RoleSwitch role={role} onChange={setRole} />
      <form className="form-stack" noValidate onSubmit={handleSubmit}>
        <label htmlFor="login-email">Email address</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value.toLowerCase())}
          aria-describedby={role === "student" ? "login-giet-email-hint" : undefined}
          required
        />
        {role === "student" && (
          <small className="giet-email-hint" id="login-giet-email-hint">
            🎓 Students must use their official GIET email ending with @giet.edu
          </small>
        )}
        <label htmlFor="login-password">Password</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" required />
        <FormMessage error={error} />
        <button className="button button-primary form-submit" type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        {role === "student" && <p className="muted-copy access-request-link">Not on the approved list? <Link to="/register">Request Access</Link></p>}
      </form>
    </AuthLayout>
  );
}

export function RoleSwitch({ role, onChange }) {
  return (
    <div className="role-switch" role="group" aria-label="Account type">
      {["student", "admin"].map((option) => (
        <button
          className={`role-option${role === option ? " active" : ""}`}
          key={option}
          type="button"
          aria-pressed={role === option}
          onClick={() => onChange(option)}
        >
          {option === "student" ? "Student" : "Admin"}
        </button>
      ))}
    </div>
  );
}

export function FormMessage({ error }) {
  return <p className="form-message" role="alert" aria-live="polite">{error}</p>;
}
