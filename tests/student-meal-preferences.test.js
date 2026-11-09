const assert = require("node:assert/strict");
const test = require("node:test");

const Meal = require("../backend/models/Meal");
const Menu = require("../backend/models/Menu");
const {
  getMealPreferences,
  saveMealPreferences,
} = require("../backend/controllers/studentController");
const { addDays, getNextSubmissionDate } = require("../backend/utils/date");

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

function validMealChoices() {
  return {
    breakfast: { status: "eat", mealType: "veg" },
    lunch: { status: "eat", mealType: "nonVeg" },
    teaTime: { status: "skip", mealType: null },
    dinner: { status: "not-selected", mealType: null },
  };
}

test("saves all four preferences in one student/date record", async () => {
  const originalFindOne = Menu.findOne;
  const originalFindOneAndUpdate = Meal.findOneAndUpdate;
  let updateFilter;
  let updateDocument;
  let savedDocument;
  const menu = {
    breakfast: { veg: ["Roti"], nonVeg: [] },
    lunch: { veg: ["Rice"], nonVeg: ["Fish"] },
  };
  Menu.findOne = () => ({ lean: async () => menu });
  Meal.findOneAndUpdate = async (filter, update) => {
    updateFilter = filter;
    updateDocument = update;
    savedDocument = { studentId: filter.studentId, date: filter.date, ...validMealChoices() };
    return savedDocument;
  };

  try {
    const response = createResponse();
    await saveMealPreferences(
      {
        user: { _id: "authenticated-student-id" },
        body: { date: getNextSubmissionDate(), meals: validMealChoices() },
      },
      response,
      (error) => { throw error; }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.meal, savedDocument);
    assert.equal(updateFilter.studentId, "authenticated-student-id");
    assert.equal(updateFilter.date, response.body.meal.date);
    assert.equal(updateDocument.$set["lunch.mealType"], "nonVeg");
    assert.equal(updateDocument.$set["teaTime.mealType"], null);
    assert.equal(updateDocument.$set["dinner.status"], "not-selected");
  } finally {
    Menu.findOne = originalFindOne;
    Meal.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("rejects EAT choices without an available, explicit food type", async () => {
  const originalFindOne = Menu.findOne;
  const originalFindOneAndUpdate = Meal.findOneAndUpdate;
  let databaseWriteAttempted = false;
  Menu.findOne = () => ({
    lean: async () => ({
      breakfast: { veg: ["Roti"], nonVeg: [] },
      lunch: { veg: ["Rice"], nonVeg: ["Fish"] },
    }),
  });
  Meal.findOneAndUpdate = async () => {
    databaseWriteAttempted = true;
  };

  try {
    const meals = validMealChoices();
    meals.lunch = { status: "eat", mealType: null };
    const response = createResponse();
    await saveMealPreferences(
      {
        user: { _id: "authenticated-student-id" },
        body: { date: getNextSubmissionDate(), meals },
      },
      response,
      (error) => { throw error; }
    );

    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /vegetarian or non-vegetarian/);
    assert.equal(databaseWriteAttempted, false);
  } finally {
    Menu.findOne = originalFindOne;
    Meal.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("rejects a closed meal date without deleting or rewriting saved preferences", async () => {
  const originalFindOneAndUpdate = Meal.findOneAndUpdate;
  let databaseWriteAttempted = false;
  Meal.findOneAndUpdate = async () => {
    databaseWriteAttempted = true;
  };

  try {
    const closedDate = addDays(getNextSubmissionDate(), -1);
    const response = createResponse();
    await saveMealPreferences(
      {
        user: { _id: "authenticated-student-id" },
        body: { date: closedDate, meals: validMealChoices() },
      },
      response,
      (error) => { throw error; }
    );

    assert.equal(response.statusCode, 403);
    assert.match(response.body.message, /deadline|only for the next available date/i);
    assert.equal(databaseWriteAttempted, false);
  } finally {
    Meal.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("keeps saved preferences readable for a closed date", async () => {
  const originalFindOne = Meal.findOne;
  const storedMeal = { breakfast: { status: "eat", mealType: "veg" } };
  let requestedFilter;
  Meal.findOne = (filter) => {
    requestedFilter = filter;
    return { lean: async () => storedMeal };
  };

  try {
    const date = addDays(getNextSubmissionDate(), -1);
    const response = createResponse();
    await getMealPreferences(
      {
        user: { _id: "authenticated-student-id" },
        query: { date },
      },
      response,
      (error) => { throw error; }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.date, date);
    assert.equal(response.body.meal, storedMeal);
    assert.equal(requestedFilter.studentId, "authenticated-student-id");
  } finally {
    Meal.findOne = originalFindOne;
  }
});
