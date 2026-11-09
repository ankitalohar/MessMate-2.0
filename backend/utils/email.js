const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GIET_STUDENT_EMAIL_SUFFIX = "@giet.edu";

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function isValidEmailFormat(email) {
  return typeof email === "string" && emailPattern.test(email);
}

function isGietStudentEmail(email) {
  return (
    isValidEmailFormat(email) &&
    email.toLowerCase().endsWith(GIET_STUDENT_EMAIL_SUFFIX)
  );
}

module.exports = {
  GIET_STUDENT_EMAIL_SUFFIX,
  isGietStudentEmail,
  isValidEmailFormat,
  normalizeEmail,
};
