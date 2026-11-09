const assert = require("node:assert/strict");
const test = require("node:test");
const DiningAttendance = require("../backend/models/DiningAttendance");
const DiningQrToken = require("../backend/models/DiningQrToken");
const FoodPreparation = require("../backend/models/FoodPreparation");
const Meal = require("../backend/models/Meal");
const StudentAuthorization = require("../backend/models/StudentAuthorization");
const StudentDiningAttendance = require("../backend/models/StudentDiningAttendance");
const User = require("../backend/models/User");
const { scanDiningQr } = require("../backend/controllers/diningScanController");
const { buildPrediction } = require("../backend/controllers/foodDemandController");

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

test("student attendance has a unique student/date/meal index", () => {
  const hasUniqueMealIndex = StudentDiningAttendance.schema.indexes().some(([keys, options]) =>
    keys.studentId === 1 && keys.date === 1 && keys.meal === 1 && options.unique === true
  );
  assert.equal(hasUniqueMealIndex, true);
});

test("rejects an invalid or expired QR before looking up a student", async () => {
  const original = DiningQrToken.findOne;
  let studentLookup = false;
  DiningQrToken.findOne = () => ({ lean: async () => null });
  const originalFindById = User.findById;
  User.findById = () => { studentLookup = true; };
  try {
    const response = createResponse();
    await scanDiningQr({ body: { token: "x".repeat(40), meal: "lunch" }, user: { _id: "admin" } }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 401);
    assert.equal(studentLookup, false);
  } finally {
    DiningQrToken.findOne = original;
    User.findById = originalFindById;
  }
});

test("rejects an inactive student even when the QR token exists", async () => {
  const originals = { tokenFind: DiningQrToken.findOne, userFind: User.findById };
  DiningQrToken.findOne = () => ({ lean: async () => ({ studentId: "student-id" }) });
  User.findById = () => ({ select: async () => ({ _id: "student-id", role: "student", isActive: false }) });
  try {
    const response = createResponse();
    await scanDiningQr({ body: { token: "x".repeat(40), meal: "lunch" }, user: { _id: "admin" } }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 403);
  } finally {
    DiningQrToken.findOne = originals.tokenFind;
    User.findById = originals.userFind;
  }
});

test("rejects a pending student authorization", async () => {
  const originals = {
    tokenFind: DiningQrToken.findOne,
    userFind: User.findById,
    authorizationFind: StudentAuthorization.find,
  };
  const student = {
    _id: "student-id",
    role: "student",
    isActive: true,
    name: "Test Student",
    email: "test@giet.edu",
    rollNumber: "R-1",
    universityRegistrationNumber: "U-1",
  };
  DiningQrToken.findOne = () => ({ lean: async () => ({ studentId: student._id }) });
  User.findById = () => ({ select: async () => student });
  StudentAuthorization.find = () => ({ limit: async () => [{
    rollNumber: "R-1",
    universityRegistrationNumber: "U-1",
    fullName: "Test Student",
    email: "test@giet.edu",
    status: "PENDING",
  }] });
  try {
    const response = createResponse();
    await scanDiningQr({ body: { token: "x".repeat(40), meal: "lunch" }, user: { _id: "admin" } }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 403);
  } finally {
    DiningQrToken.findOne = originals.tokenFind;
    User.findById = originals.userFind;
    StudentAuthorization.find = originals.authorizationFind;
  }
});

test("records a valid attendance scan against the database student identity", async () => {
  const originals = {
    tokenFind: DiningQrToken.findOne,
    userFind: User.findById,
    authorizationFind: StudentAuthorization.find,
    menuFind: require("../backend/models/Menu").findOne,
    attendanceCreate: StudentDiningAttendance.create,
  };
  const realDate = global.Date;
  const now = "2026-11-08T12:40:00.000Z";
  global.Date = class extends realDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new realDate(now).getTime(); }
  };
  const student = {
    _id: "student-id",
    role: "student",
    isActive: true,
    name: "Test Student",
    email: "test@giet.edu",
    rollNumber: "R-1",
    universityRegistrationNumber: "U-1",
  };
  let savedRecord;
  DiningQrToken.findOne = () => ({ lean: async () => ({ studentId: student._id }) });
  User.findById = () => ({ select: async () => student });
  StudentAuthorization.find = () => ({ limit: async () => [{
    rollNumber: "R-1",
    universityRegistrationNumber: "U-1",
    fullName: "Test Student",
    email: "test@giet.edu",
    status: "APPROVED",
  }] });
  require("../backend/models/Menu").findOne = () => ({ select: () => ({ lean: async () => null }) });
  StudentDiningAttendance.create = async (record) => {
    savedRecord = record;
    return { _id: "attendance-id", ...record };
  };
  try {
    const response = createResponse();
    await scanDiningQr({ body: { token: "x".repeat(40), meal: "teaTime" }, user: { _id: "admin-id" } }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 201);
    assert.equal(savedRecord.studentId, "student-id");
    assert.equal(savedRecord.recordedBy, "admin-id");
    assert.equal(savedRecord.meal, "teaTime");
    assert.equal(savedRecord.date, "2026-11-08");
  } finally {
    global.Date = realDate;
    DiningQrToken.findOne = originals.tokenFind;
    User.findById = originals.userFind;
    StudentAuthorization.find = originals.authorizationFind;
    require("../backend/models/Menu").findOne = originals.menuFind;
    StudentDiningAttendance.create = originals.attendanceCreate;
  }
});

test("duplicate attendance is rejected by the unique index", async () => {
  const originals = {
    tokenFind: DiningQrToken.findOne,
    userFind: User.findById,
    authorizationFind: StudentAuthorization.find,
    menuFind: require("../backend/models/Menu").findOne,
    attendanceCreate: StudentDiningAttendance.create,
  };
  const realDate = global.Date;
  const now = "2026-11-08T12:40:00.000Z";
  global.Date = class extends realDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new realDate(now).getTime(); }
  };
  const student = {
    _id: "student-id", role: "student", isActive: true, name: "Test Student",
    email: "test@giet.edu", rollNumber: "R-1", universityRegistrationNumber: "U-1",
  };
  DiningQrToken.findOne = () => ({ lean: async () => ({ studentId: student._id }) });
  User.findById = () => ({ select: async () => student });
  StudentAuthorization.find = () => ({ limit: async () => [{
    rollNumber: "R-1", universityRegistrationNumber: "U-1", fullName: "Test Student",
    email: "test@giet.edu", status: "APPROVED",
  }] });
  require("../backend/models/Menu").findOne = () => ({ select: () => ({ lean: async () => null }) });
  StudentDiningAttendance.create = async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); };
  try {
    const response = createResponse();
    await scanDiningQr({ body: { token: "x".repeat(40), meal: "teaTime" }, user: { _id: "admin-id" } }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 409);
  } finally {
    global.Date = realDate;
    DiningQrToken.findOne = originals.tokenFind;
    User.findById = originals.userFind;
    StudentAuthorization.find = originals.authorizationFind;
    require("../backend/models/Menu").findOne = originals.menuFind;
    StudentDiningAttendance.create = originals.attendanceCreate;
  }
});

test("baseline uses unique EAT students and only prior same-weekday attendance", async () => {
  const originals = {
    mealFind: Meal.find,
    studentAttendanceFind: StudentDiningAttendance.find,
    aggregateFind: DiningAttendance.find,
    preparationFind: FoodPreparation.find,
  };
  let historicalFilter;
  Meal.find = (filter) => {
    if (typeof filter.date === "string") return { lean: async () => [
      { studentId: "eat-1", lunch: { status: "eat" } },
      { studentId: "eat-1", lunch: { status: "eat" } },
      { studentId: "skip-1", lunch: { status: "skip" } },
    ] };
    historicalFilter = filter;
    return { lean: async () => [
      { studentId: "eat-1", date: "2026-10-05", lunch: { status: "eat" } },
      { studentId: "eat-2", date: "2026-10-05", lunch: { status: "eat" } },
      { studentId: "eat-3", date: "2026-10-06", lunch: { status: "eat" } },
    ] };
  };
  StudentDiningAttendance.find = () => ({ select() { return this; }, lean: async () => [
    { date: "2026-10-05", meal: "lunch", studentId: "eat-1" },
    { date: "2026-10-05", meal: "lunch", studentId: "skip-1" },
  ] });
  DiningAttendance.find = () => ({ select() { return this; }, lean: async () => [
    { date: "2026-10-05", meal: "lunch", attendanceCount: 8 },
    { date: "2026-10-06", meal: "lunch", attendanceCount: 1 },
  ] });
  FoodPreparation.find = () => ({ select() { return this; }, lean: async () => [
    { date: "2026-10-05", unit: "kg", quantityServed: 2.4 },
    { date: "2026-10-05", unit: "g", quantityServed: 1000 },
  ] });
  try {
    const result = await buildPrediction("2026-10-12", "lunch", ["eat-1", "skip-1"]);
    assert.equal(historicalFilter.date.$lt, "2026-10-12");
    assert.equal(result.eatCount, 1);
    assert.equal(result.historicalAttendanceRate, 0.5);
    assert.equal(result.predictedAttendance, 1);
    assert.equal(result.previousAttendance, 1);
    assert.equal(result.averageConsumptionPerStudentGrams, 1700);
    assert.equal(result.recommendedQuantityKg, 2);
    assert.equal(result.historicalAttendanceDays, 1);
  } finally {
    Meal.find = originals.mealFind;
    StudentDiningAttendance.find = originals.studentAttendanceFind;
    DiningAttendance.find = originals.aggregateFind;
    FoodPreparation.find = originals.preparationFind;
  }
});

test("baseline labels missing history and consumption instead of inventing records", async () => {
  const originals = {
    mealFind: Meal.find,
    studentAttendanceFind: StudentDiningAttendance.find,
    aggregateFind: DiningAttendance.find,
    preparationFind: FoodPreparation.find,
  };
  Meal.find = (filter) => ({ lean: async () => typeof filter.date === "string"
    ? [{ studentId: "eat-1", dinner: { status: "eat" } }]
    : [] });
  StudentDiningAttendance.find = () => ({ select() { return this; }, lean: async () => [] });
  DiningAttendance.find = () => ({ select() { return this; }, lean: async () => [] });
  FoodPreparation.find = () => ({ select() { return this; }, lean: async () => [] });
  try {
    const result = await buildPrediction("2026-10-12", "dinner", ["eat-1"]);
    assert.equal(result.predictedAttendance, 1);
    assert.equal(result.confidence, "insufficient");
    assert.equal(result.averageConsumptionPerStudentGrams, null);
    assert.equal(result.recommendedQuantityKg, null);
    assert.match(result.dataAvailability, /No prior actual attendance/);
  } finally {
    Meal.find = originals.mealFind;
    StudentDiningAttendance.find = originals.studentAttendanceFind;
    DiningAttendance.find = originals.aggregateFind;
    FoodPreparation.find = originals.preparationFind;
  }
});