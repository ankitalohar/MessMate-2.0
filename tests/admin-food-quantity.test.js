const assert = require("node:assert/strict");
const test = require("node:test");
const Meal = require("../backend/models/Meal");
const Menu = require("../backend/models/Menu");
const User = require("../backend/models/User");
const { getFoodQuantity, getStatistics } = require("../backend/controllers/adminController");

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

async function withMealData(run, menu = null, records = null) {
  const originalUserFind = User.find;
  const originalMealFind = Meal.find;
  const originalMenuFindOne = Menu.findOne;
  const students = ["student-1", "student-2", "student-3"].map((_id, index) => ({
    _id,
    isActive: true,
  }));
  const mealRecords = records || [
    {
      studentId: "student-1",
      breakfast: { status: "eat", mealType: "veg" },
    },
    {
      studentId: "student-2",
      breakfast: { status: "eat", mealType: "veg" },
    },
    {
      studentId: "student-3",
      breakfast: { status: "skip", mealType: null },
    },
  ];
  User.find = () => ({
    select() {
      return this;
    },
    sort() {
      return this;
    },
    lean: async () => students,
  });
  Meal.find = () => ({ lean: async () => mealRecords });
  Menu.findOne = () => ({ lean: async () => menu });

  try {
    await run();
  } finally {
    User.find = originalUserFind;
    Meal.find = originalMealFind;
    Menu.findOne = originalMenuFindOne;
  }
}

test("food quantity defaults to zero buffer and reports confirmed and planned servings", async () => {
  await withMealData(async () => {
    const response = createResponse();
    await getFoodQuantity({ query: { date: "2026-10-13" } }, response, (error) => {
      throw error;
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.meals.breakfast, {
      confirmedVeg: 2,
      confirmedNonVeg: 0,
      confirmedTotal: 2,
      categorizedConfirmedTotal: 2,
      skipped: 1,
      notSelected: 0,
      incomplete: 0,
      bufferPercent: 0,
      bufferVeg: 0,
      bufferNonVeg: 0,
      bufferTotal: 0,
      recommendedVeg: 2,
      recommendedNonVeg: 0,
      recommendedTotal: 2,
      ingredients: [],
      unconfiguredVegServings: 2,
      unconfiguredNonVegServings: 0,
    });

  });
});

test("selected-date statistics count active students and meal choices from stored preferences", async () => {
  const originalUserFind = User.find;
  const originalMealFind = Meal.find;
  User.find = () => ({
    select() {
      return this;
    },
    sort() {
      return this;
    },
    lean: async () => [
      { _id: "active-eat", isActive: true },
      { _id: "active-skip", isActive: true },
      { _id: "active-no-record", isActive: true },
      { _id: "inactive-eat", isActive: false },
    ],
  });
  Meal.find = () => ({
    lean: async () => [
      { studentId: "active-eat", breakfast: { status: "eat", mealType: "veg" } },
      { studentId: "active-skip", breakfast: { status: "skip", mealType: null } },
      { studentId: "inactive-eat", breakfast: { status: "eat", mealType: "nonVeg" } },
    ],
  });

  try {
    const response = createResponse();
    await getStatistics({ query: { date: "2026-10-13" } }, response, (error) => {
      throw error;
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.totalStudents, 3);
    assert.deepEqual(response.body.meals.breakfast, {
      eat: 1,
      skip: 1,
      notSelected: 1,
      veg: 1,
      nonVeg: 0,
      incomplete: 0,
    });
  } finally {
    User.find = originalUserFind;
    Meal.find = originalMealFind;
  }
});

test("estimates configured ingredient quantities from confirmed servings and applies the buffer", async () => {
  const menu = {
    breakfast: {
      ingredients: {
        veg: [{ name: "Rice", quantityPerServing: 125, unit: "g" }],
        nonVeg: [],
      },
    },
  };
  await withMealData(async () => {
    const response = createResponse();
    await getFoodQuantity(
      { query: { date: "2026-10-13", bufferPercent: "10" } },
      response,
      (error) => { throw error; }
    );

    assert.deepEqual(response.body.meals.breakfast.ingredients, [{
      name: "Rice",
      unit: "g",
      baseQuantity: 250,
      bufferQuantity: 25,
      plannedQuantity: 275,
    }]);
    assert.equal(response.body.meals.breakfast.unconfiguredVegServings, 0);
  }, menu);
});

test("flags EAT choices without a valid food preference and excludes them from ingredient estimates", async () => {
  await withMealData(async () => {
    const response = createResponse();
    await getFoodQuantity({ query: { date: "2026-10-13" } }, response, (error) => {
      throw error;
    });

    assert.equal(response.body.meals.breakfast.confirmedTotal, 1);
    assert.equal(response.body.meals.breakfast.incomplete, 1);
    assert.equal(response.body.meals.breakfast.confirmedVeg, 0);
    assert.equal(response.body.meals.breakfast.confirmedNonVeg, 0);
    assert.equal(response.body.meals.breakfast.recommendedTotal, 0);
  }, null, [
    { studentId: "student-1", breakfast: { status: "eat", mealType: null } },
  ]);
});

test("food quantity applies an explicitly requested buffer to confirmed EAT choices only", async () => {
  await withMealData(async () => {
    const response = createResponse();
    await getFoodQuantity(
      { query: { date: "2026-10-13", bufferPercent: "25" } },
      response,
      (error) => { throw error; }
    );

    assert.equal(response.body.meals.breakfast.confirmedVeg, 2);
    assert.equal(response.body.meals.breakfast.skipped, 1);
    assert.equal(response.body.meals.breakfast.bufferVeg, 1);
    assert.equal(response.body.meals.breakfast.recommendedVeg, 3);
    assert.equal(response.body.meals.breakfast.recommendedTotal, 3);
  });
});
