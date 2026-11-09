const assert = require("node:assert/strict");
const test = require("node:test");

let getDefaultMealDate;

test.before(async () => {
  ({ getDefaultMealDate } = await import("../frontend/src/utils/mealDate.js"));
});

test("defaults to tomorrow before the Asia/Kolkata cutoff", () => {
  const now = new Date("2026-10-11T16:29:00.000Z");
  assert.equal(getDefaultMealDate(now), "2026-10-12");
});

test("defaults to the next available date at and after the Asia/Kolkata cutoff", () => {
  const atCutoff = new Date("2026-10-11T16:30:00.000Z");
  const afterCutoff = new Date("2026-10-11T18:22:00.000Z");
  assert.equal(getDefaultMealDate(atCutoff), "2026-10-13");
  assert.equal(getDefaultMealDate(afterCutoff), "2026-10-13");
});

test("calculates the date in Asia/Kolkata independently of the machine timezone", () => {
  const instant = new Date("2026-10-11T18:30:00.000Z");
  assert.equal(getDefaultMealDate(instant), "2026-10-13");
});
