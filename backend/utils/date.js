const TIME_ZONE = "Asia/Kolkata";
const CUTOFF_HOUR = 22;
const CUTOFF_MINUTE = 0;
const CUTOFF_LABEL = "10:00 PM";

function getDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function getDateKey(date = new Date()) {
  const parts = getDateTimeParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getNextSubmissionDate(now = new Date()) {
  const parts = getDateTimeParts(now);
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const cutoffPassed =
    hour > CUTOFF_HOUR ||
    (hour === CUTOFF_HOUR && minute >= CUTOFF_MINUTE);
  return addDays(today, cutoffPassed ? 2 : 1);
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isMealSubmissionOpen(dateKey, now = new Date()) {
  return isValidDateKey(dateKey) && dateKey === getNextSubmissionDate(now);
}

function getSubmissionDeadlineDate(dateKey) {
  return addDays(dateKey, -1);
}

function getSubmissionDeadlineAt(dateKey) {
  return new Date(`${getSubmissionDeadlineDate(dateKey)}T16:30:00.000Z`);
}

module.exports = {
  CUTOFF_LABEL,
  TIME_ZONE,
  addDays,
  getDateKey,
  getNextSubmissionDate,
  getSubmissionDeadlineAt,
  getSubmissionDeadlineDate,
  isMealSubmissionOpen,
  isValidDateKey,
};
