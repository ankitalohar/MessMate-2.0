const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CUTOFF_LABEL,
  TIME_ZONE,
  addDays,
  getDateKey,
  getNextSubmissionDate,
  getSubmissionDeadlineAt,
  getSubmissionDeadlineDate,
  isMealSubmissionOpen,
  isValidDateKey,
} = require("../backend/utils/date");

test("uses Asia/Kolkata for the server date regardless of APP_TIMEZONE", () => {
  const previousTimeZone = process.env.APP_TIMEZONE;
  process.env.APP_TIMEZONE = "UTC";
  try {
    assert.equal(TIME_ZONE, "Asia/Kolkata");
    assert.equal(getDateKey(new Date("2026-10-11T18:29:59.000Z")), "2026-10-11");
    assert.equal(getDateKey(new Date("2026-10-11T18:30:00.000Z")), "2026-10-12");
  } finally {
    if (previousTimeZone === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = previousTimeZone;
  }
});

test("validates real calendar dates in YYYY-MM-DD format", () => {
  assert.equal(isValidDateKey("2026-10-11"), true);
  assert.equal(isValidDateKey("2026-02-30"), false);
  assert.equal(isValidDateKey("26-10-11"), false);
});

test("opens tomorrow submissions before 10 PM and closes at the exact cutoff", () => {
  const beforeCutoff = new Date("2026-10-11T16:29:59.000Z");
  const atCutoff = new Date("2026-10-11T16:30:00.000Z");

  assert.equal(CUTOFF_LABEL, "10:00 PM");
  assert.equal(getNextSubmissionDate(beforeCutoff), "2026-10-12");
  assert.equal(isMealSubmissionOpen("2026-10-12", beforeCutoff), true);
  assert.equal(getNextSubmissionDate(atCutoff), "2026-10-13");
  assert.equal(isMealSubmissionOpen("2026-10-12", atCutoff), false);
  assert.equal(isMealSubmissionOpen("2026-10-13", atCutoff), true);
});

test("advances the submission date at midnight and rejects yesterday", () => {
  const afterMidnight = new Date("2026-10-11T18:30:00.000Z");

  assert.equal(getDateKey(afterMidnight), "2026-10-12");
  assert.equal(getNextSubmissionDate(afterMidnight), "2026-10-13");
  assert.equal(isMealSubmissionOpen("2026-10-12", afterMidnight), false);
  assert.equal(isMealSubmissionOpen("2026-10-13", afterMidnight), true);
});

test("calculates the deadline date using calendar arithmetic", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(getSubmissionDeadlineDate("2026-10-12"), "2026-10-11");
  assert.equal(
    getSubmissionDeadlineAt("2026-10-12").toISOString(),
    "2026-10-11T16:30:00.000Z"
  );
});
