const assert = require("node:assert/strict");
const test = require("node:test");
const DiningAttendance = require("../backend/models/DiningAttendance");
const Meal = require("../backend/models/Meal");
const User = require("../backend/models/User");
const { getAttendance, saveAttendance } = require("../backend/controllers/attendanceController");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("computes expected EAT from active students and compares aggregate attendance", async () => {
  const originals = {
    attendanceFind: DiningAttendance.find,
    userFind: User.find,
    mealFind: Meal.find,
  };
  let preferenceFilter;
  DiningAttendance.find = () => ({
    sort() {
      return this;
    },
    lean: async () => [{
      date: "2026-10-12",
      meal: "lunch",
      attendanceCount: 8,
    }],
  });
  User.find = () => ({
    select() {
      return this;
    },
    lean: async () => [{ _id: "active-1" }, { _id: "active-2" }],
  });
  Meal.find = (filter) => {
    preferenceFilter = filter;
    return {
      lean: async () => [
        { studentId: "active-1", date: "2026-10-12", lunch: { status: "eat" } },
        { studentId: "active-2", date: "2026-10-12", lunch: { status: "skip" } },
      ],
    };
  };
  try {
    const response = createResponse();
    await getAttendance({ query: { date: "2026-10-12" } }, response, (error) => { throw error; });
    assert.deepEqual(preferenceFilter, {
      date: { $in: ["2026-10-12"] },
      studentId: { $in: ["active-1", "active-2"] },
    });
    assert.equal(response.body.attendance[0].expectedEatCount, 1);
    assert.equal(response.body.attendance[0].difference, 7);
  } finally {
    DiningAttendance.find = originals.attendanceFind;
    User.find = originals.userFind;
    Meal.find = originals.mealFind;
  }
});

test("rejects aggregate attendance exceeding active student count", async () => {
  const originals = { countDocuments: User.countDocuments, upsert: DiningAttendance.findOneAndUpdate };
  let attemptedWrite = false;
  User.countDocuments = async () => 2;
  DiningAttendance.findOneAndUpdate = async () => { attemptedWrite = true; };
  try {
    const response = createResponse();
    await saveAttendance({
      user: { _id: "admin-id" },
      body: { date: "2026-10-12", meal: "dinner", attendanceCount: 3 },
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 400);
    assert.equal(attemptedWrite, false);
  } finally {
    User.countDocuments = originals.countDocuments;
    DiningAttendance.findOneAndUpdate = originals.upsert;
  }
});

test("saves actual attendance using an upsert and authenticated admin identity", async () => {
  const originals = {
    countDocuments: User.countDocuments,
    upsert: DiningAttendance.findOneAndUpdate,
    userFind: User.find,
    mealFind: Meal.find,
  };
  let filter;
  let update;
  User.countDocuments = async () => 20;
  DiningAttendance.findOneAndUpdate = async (query, changes) => {
    filter = query;
    update = changes;
    return {
      date: query.date,
      meal: query.meal,
      attendanceCount: changes.$set.attendanceCount,
      toObject() {
        return {
          date: this.date,
          meal: this.meal,
          attendanceCount: this.attendanceCount,
        };
      },
    };
  };
  User.find = () => ({
    select() {
      return this;
    },
    lean: async () => [],
  });
  Meal.find = () => ({ lean: async () => [] });
  try {
    const response = createResponse();
    await saveAttendance({
      user: { _id: "admin-id" },
      body: { date: "2026-10-12", meal: "breakfast", attendanceCount: 16 },
    }, response, (error) => { throw error; });
    assert.deepEqual(filter, { date: "2026-10-12", meal: "breakfast" });
    assert.equal(update.$set.recordedBy, "admin-id");
    assert.equal(response.body.attendance.attendanceCount, 16);
  } finally {
    User.countDocuments = originals.countDocuments;
    DiningAttendance.findOneAndUpdate = originals.upsert;
    User.find = originals.userFind;
    Meal.find = originals.mealFind;
  }
});
