import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiRequest } from "../api/client.js";
import { FormMessage, RoleSwitch } from "./LoginPage.jsx";
import {
  hasGietStudentEmailDomain,
  isValidEmailFormat,
  normalizeEmail,
  STUDENT_REGISTRATION_EMAIL_ERROR,
} from "../auth/email.js";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState("student");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const formRef = useRef(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setAccessMessage("");
    const form = new FormData(event.currentTarget);
    const normalizedEmail = normalizeEmail(form.get("email"));
    setEmail(normalizedEmail);
    if (role === "student" && !hasGietStudentEmailDomain(normalizedEmail)) {
      setError(STUDENT_REGISTRATION_EMAIL_ERROR);
      return;
    }
    if (!isValidEmailFormat(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    const adminRegistrationKey =
      role === "admin"
        ? String(form.get("adminRegistrationKey") || "").trim()
        : "";
    if (role === "admin" && !adminRegistrationKey) {
      setError("A valid admin invitation key is required.");
      return;
    }
    event.currentTarget.elements.email.value = normalizedEmail;
    if (!event.currentTarget.reportValidity()) return;
    setSubmitting(true);
    const password = form.get("password");
    if (password !== form.get("confirmPassword")) {
      setError("Passwords do not match.");
      setSubmitting(false);
      return;
    }

    const details = {
      name: form.get("name"),
      email: normalizedEmail,
      mobile: form.get("mobile"),
      password,
      confirmPassword: form.get("confirmPassword"),
      role,
      rollNumber: String(form.get("rollNumber") || "").trim().toUpperCase(),
      universityRegistrationNumber: String(form.get("universityRegistrationNumber") || "").trim().toUpperCase(),
      hostel: form.get("hostel"),
      room: form.get("room"),
    };
    if (role === "admin") {
      details.adminRegistrationKey = adminRegistrationKey;
    }

    try {
      const user = await register(details);
      navigate(user.role === "admin" ? "/admin" : "/student", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestAccess() {
    setError("");
    setAccessMessage("");
    const form = formRef.current;
    if (!form) return;
    const values = new FormData(form);
    const normalizedEmail = normalizeEmail(values.get("email"));
    if (!hasGietStudentEmailDomain(normalizedEmail) || !isValidEmailFormat(normalizedEmail)) {
      setError(STUDENT_REGISTRATION_EMAIL_ERROR);
      return;
    }
    setRequestingAccess(true);
    try {
      const result = await apiRequest("/auth/request-access", {
        method: "POST",
        authenticated: false,
        body: {
          rollNumber: values.get("rollNumber"),
          universityRegistrationNumber: values.get("universityRegistrationNumber"),
          name: values.get("name"),
          email: normalizedEmail,
        },
      });
      setAccessMessage(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRequestingAccess(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="GET STARTED"
      title="Create your account"
      description="Join your hostel community and make meal planning simpler."
      footer={<>Already registered? <Link to="/login">Sign in</Link></>}
    >
      <RoleSwitch role={role} onChange={setRole} />
      <form ref={formRef} className="form-stack register-form" noValidate onSubmit={handleSubmit}>
        <label htmlFor="register-name">Full name</label>
        <input id="register-name" name="name" autoComplete="name" maxLength="100" minLength="2" required />
        {role === "student" && (
          <>
            <label htmlFor="register-roll-number">Student roll number</label>
            <input id="register-roll-number" name="rollNumber" autoComplete="off" maxLength="30" required />
            <label htmlFor="register-university-registration">University registration number</label>
            <input id="register-university-registration" name="universityRegistrationNumber" autoComplete="off" maxLength="40" required />
          </>
        )}
        <label htmlFor="register-email">Email address</label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength="254"
          value={email}
          onChange={(event) => setEmail(event.target.value.toLowerCase())}
          aria-describedby={role === "student" ? "register-giet-email-hint" : undefined}
          required
        />
        {role === "student" && (
          <small className="giet-email-hint" id="register-giet-email-hint">
            🎓 Students must use their official GIET email ending with @giet.edu
          </small>
        )}
        <label htmlFor="register-mobile">Mobile number</label>
        <input id="register-mobile" name="mobile" type="tel" autoComplete="tel" maxLength="20" minLength="7" required />
        <div className="field-pair">
          <div><label htmlFor="register-hostel">Hostel <span>(optional)</span></label><input id="register-hostel" name="hostel" maxLength="100" /></div>
          <div><label htmlFor="register-room">Room <span>(optional)</span></label><input id="register-room" name="room" maxLength="30" /></div>
        </div>
        <label htmlFor="register-password">Password</label>
        <input id="register-password" name="password" type="password" autoComplete="new-password" minLength="8" maxLength="128" required />
        <label htmlFor="register-confirm">Confirm password</label>
        <input id="register-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength="8" maxLength="128" required />
        {role === "admin" && (
          <div className="invitation-field">
            <label htmlFor="adminRegistrationKey">Admin Invitation Key</label>
            <input
              type="password"
              id="adminRegistrationKey"
              name="adminRegistrationKey"
              placeholder="Enter admin invitation key"
              autoComplete="off"
              required
            />
            <small>Ask your MessMate administrator for an invitation key.</small>
          </div>
        )}
        <FormMessage error={error} />
        {accessMessage && <p className="notice notice-success" role="status">{accessMessage}</p>}
        <button className="button button-primary form-submit" type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
        {role === "student" && (
          <button
            className="button button-outline form-submit"
            type="button"
            onClick={handleRequestAccess}
            disabled={requestingAccess}
          >
            {requestingAccess ? "Submitting request…" : "Request Access"}
          </button>
        )}
      </form>
    </AuthLayout>
  );
}
