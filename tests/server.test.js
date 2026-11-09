const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const jwt = require("jsonwebtoken");
const FoodPreparation = require("../backend/models/FoodPreparation");
const Meal = require("../backend/models/Meal");
const Menu = require("../backend/models/Menu");
const User = require("../backend/models/User");
const { getNextSubmissionDate } = require("../backend/utils/date");
const { app, startServer } = require("../server/server");

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("serves the API health route as JSON", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    message: "MessMate API is running",
  });
});

test("returns controlled JSON for rejected CORS origins", async () => {
  const response = await fetch(`${baseUrl}/`, {
    headers: { Origin: "https://unapproved.example" },
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.deepEqual(await response.json(), {
    success: false,
    message: "This origin is not allowed.",
  });
});

test("allows configured development origins", async () => {
  const response = await fetch(`${baseUrl}/`, {
    headers: { Origin: "http://localhost:5173" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
});

test("denies admin APIs to an authenticated student", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;
  process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
  User.findById = () => ({
    select: async () => ({
      _id: "student-account-id",
      name: "Student",
      role: "student",
      isActive: true,
    }),
  });

  try {
    const token = jwt.sign({ sub: "student-account-id" }, process.env.JWT_SECRET);
    const response = await fetch(`${baseUrl}/api/admin/statistics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      message: "You do not have permission to do this.",
    });
    const preparationResponse = await fetch(`${baseUrl}/api/admin/food-preparation`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(preparationResponse.status, 403);
    const feedbackResponse = await fetch(`${baseUrl}/api/admin/feedback`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(feedbackResponse.status, 403);
    const inventoryResponse = await fetch(`${baseUrl}/api/admin/inventory`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(inventoryResponse.status, 403);
    const attendanceResponse = await fetch(`${baseUrl}/api/admin/attendance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(attendanceResponse.status, 403);
    const donationResponse = await fetch(`${baseUrl}/api/admin/donations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(donationResponse.status, 403);
    const announcementResponse = await fetch(`${baseUrl}/api/admin/announcements`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject: "Test", message: "Test" }),
    });
    assert.equal(announcementResponse.status, 403);
  } finally {
    User.findById = originalFindById;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("serves selected-date admin demand from active student and saved meal records", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalUserFindById = User.findById;
  const originalUserFind = User.find;
  const originalMealFind = Meal.find;
  const originalMenuFindOne = Menu.findOne;
  const originalFoodPreparationFind = FoodPreparation.find;
  process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
  User.findById = () => ({
    select: async () => ({
      _id: "admin-account-id",
      role: "admin",
      isActive: true,
    }),
  });
  User.find = () => ({
    select() {
      return this;
    },
    sort() {
      return this;
    },
    lean: async () => [
      { _id: "active-veg", isActive: true },
      { _id: "active-skip", isActive: true },
      { _id: "active-no-choice", isActive: true },
      { _id: "inactive-non-veg", isActive: false },
    ],
  });
  Meal.find = () => ({
    lean: async () => [
      { studentId: "active-veg", breakfast: { status: "eat", mealType: "veg" } },
      { studentId: "active-skip", breakfast: { status: "skip", mealType: null } },
      { studentId: "inactive-non-veg", breakfast: { status: "eat", mealType: "nonVeg" } },
    ],
  });
  Menu.findOne = () => ({ lean: async () => null });
  FoodPreparation.find = (filter) => ({
    sort() {
      assert.deepEqual(filter, { date: "2026-10-12" });
      return this;
    },
    lean: async () => [{
      _id: "preparation-1",
      date: "2026-10-12",
      meal: "breakfast",
      foodItem: "Rice",
      quantityPrepared: 10,
      quantityServed: 8,
      quantityDiscarded: 1,
      unit: "kg",
    }],
  });

  try {
    const token = jwt.sign({ sub: "admin-account-id" }, process.env.JWT_SECRET);
    const headers = { Authorization: `Bearer ${token}` };
    const statisticsResponse = await fetch(
      `${baseUrl}/api/admin/statistics?date=2026-10-12`,
      { headers }
    );
    const statistics = await statisticsResponse.json();
    assert.equal(statisticsResponse.status, 200);
    assert.equal(statistics.totalStudents, 3);
    assert.equal(statistics.meals.breakfast.eat, 1);
    assert.equal(statistics.meals.breakfast.skip, 1);
    assert.equal(statistics.meals.breakfast.notSelected, 1);
    assert.equal(statistics.meals.breakfast.veg, 1);
    assert.equal(statistics.meals.breakfast.nonVeg, 0);

    const quantityResponse = await fetch(
      `${baseUrl}/api/admin/food-quantity?date=2026-10-12`,
      { headers }
    );
    const quantities = await quantityResponse.json();
    assert.equal(quantityResponse.status, 200);
    assert.equal(quantities.meals.breakfast.confirmedVeg, 1);
    assert.equal(quantities.meals.breakfast.confirmedNonVeg, 0);
    assert.equal(quantities.meals.breakfast.categorizedConfirmedTotal, 1);
    assert.equal(quantities.meals.breakfast.recommendedTotal, 1);

    const preparationResponse = await fetch(
      `${baseUrl}/api/admin/food-preparation?date=2026-10-12`,
      { headers }
    );
    const preparation = await preparationResponse.json();
    assert.equal(preparationResponse.status, 200);
    assert.equal(preparation.records[0].quantityRemaining, 2);
    assert.equal(preparation.records[0].quantityUnaccounted, 1);
  } finally {
    User.findById = originalUserFindById;
    User.find = originalUserFind;
    Meal.find = originalMealFind;
    Menu.findOne = originalMenuFindOne;
    FoodPreparation.find = originalFoodPreparationFind;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("routes the authenticated student's batch meal save to the existing meals API", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalUserFindById = User.findById;
  const originalMenuFindOne = Menu.findOne;
  const originalMealFindOneAndUpdate = Meal.findOneAndUpdate;
  const studentId = "student-account-id";
  let savedFilter;
  process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
  User.findById = () => ({
    select: async () => ({ _id: studentId, role: "student", isActive: true }),
  });
  Menu.findOne = () => ({
    lean: async () => ({
      breakfast: { veg: ["Roti"], nonVeg: [] },
      lunch: { veg: ["Rice"], nonVeg: ["Fish"] },
    }),
  });
  Meal.findOneAndUpdate = async (filter, update) => {
    savedFilter = filter;
    return {
      studentId,
      date: filter.date,
      breakfast: { status: update.$set["breakfast.status"], mealType: update.$set["breakfast.mealType"] },
    };
  };

  try {
    const token = jwt.sign({ sub: studentId }, process.env.JWT_SECRET);
    const response = await fetch(`${baseUrl}/api/student/meals`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date: getNextSubmissionDate(),
        meals: {
          breakfast: { status: "eat", mealType: "veg" },
          lunch: { status: "eat", mealType: "nonVeg" },
          teaTime: { status: "skip", mealType: null },
          dinner: { status: "not-selected", mealType: null },
        },
      }),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.meal.breakfast.status, "eat");
    assert.equal(savedFilter.studentId, studentId);
  } finally {
    User.findById = originalUserFindById;
    Menu.findOne = originalMenuFindOne;
    Meal.findOneAndUpdate = originalMealFindOneAndUpdate;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("wires auth routes and rejects invalid student email before database access", async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "student", email: "test@gmail.com" }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    message: "Only GIET student email addresses ending with @giet.edu are allowed.",
  });
});

test("returns JSON for missing API endpoints and malformed JSON", async () => {
  const missing = await fetch(`${baseUrl}/api/not-a-route`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {
    success: false,
    message: "API endpoint not found.",
  });

  const malformed = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    success: false,
    message: "Request body must be valid JSON.",
  });
});

test("requires a 32-character JWT secret before connecting to MongoDB", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "too-short";
  try {
    await assert.rejects(startServer(), {
      message: "JWT_SECRET in server/.env must be at least 32 characters.",
    });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
