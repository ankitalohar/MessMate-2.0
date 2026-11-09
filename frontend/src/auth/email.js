export const STUDENT_REGISTRATION_EMAIL_ERROR =
  "Student registration is only available with a valid GIET email address ending in @giet.edu.";
export const STUDENT_LOGIN_EMAIL_ERROR =
  "Student login is only available for GIET email addresses ending with @giet.edu.";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function hasGietStudentEmailDomain(email) {
  return normalizeEmail(email).endsWith("@giet.edu");
}

export function isValidEmailFormat(email) {
  return emailPattern.test(email);
}
