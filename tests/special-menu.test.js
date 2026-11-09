const assert = require("node:assert/strict");
const test = require("node:test");
const Menu = require("../backend/models/Menu");
const Meal = require("../backend/models/Meal");
const { getMenu, saveMealPreferences } = require("../backend/controllers/studentController");
const {
  createSpecialMenu,
  deleteSpecialMenu,
  setSpecialMenuPublished,
  updateSpecialMenu,
} = require("../backend/controllers/adminController");
const { getNextSubmissionDate } = require("../backend/utils/date");

const specialId = "0123456789abcdef01234567";

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

function specialRecord(overrides = {}) {
  return {
    _id: specialId,
    occasionName: "Diwali Celebration",
    occasionKey: "diwali celebration",
    date: "2026-11-08",
    lunch: { veg: ["Special Paneer"], nonVeg: [] },
    description: "Festival meal",
    isPublished: true,
    createdBy: "admin-id",
    updatedBy: "admin-id",
    ...overrides,
  };
}

test("Menu embeds special-menu fields without introducing another model", () => {
  const menuSchema = Menu.schema;
  assert.ok(menuSchema.path("specialMenus"));
  assert.equal(Menu.modelName, "Menu");
  assert.equal(typeof menuSchema.path("specialMenus").schema.path("lunch").schema.path("veg").defaultValue, "function");
  const menu = new Menu({
    date: "2026-11-08",
    specialMenus: [{
      occasionName: "Diwali Celebration",
      occasionKey: "diwali celebration",
      date: "2026-11-08",
      lunch: { veg: ["Festival Paneer"], nonVeg: [] },
      createdBy: "0123456789abcdef01234567",
      updatedBy: "0123456789abcdef01234567",
    }],
  });
  assert.equal(menu.validateSync(), undefined);
  assert.deepEqual(menu.specialMenus[0].lunch.veg, ["Festival Paneer"]);
});

test("student menu exposes published specials only and keeps meal timings", async () => {
  const original = Menu.findOne;
  const published = specialRecord();
  const unpublished = specialRecord({ _id: "1123456789abcdef01234567", occasionName: "Private Draft", isPublished: false });
  Menu.findOne = () => ({ lean: async () => ({
    date: "2026-11-08",
    breakfast: { veg: ["Regular breakfast"], nonVeg: [] },
    lunch: { veg: ["Regular lunch"], nonVeg: [] },
    teaTime: { veg: ["Regular tea"], nonVeg: [] },
    dinner: { veg: ["Regular dinner"], nonVeg: [] },
    specialMenus: [published, unpublished],
  }) });
  try {
    const response = createResponse();
    await getMenu({ query: { date: "2026-11-08" } }, response, (error) => { throw error; });
    assert.equal(response.body.menu.specialMenus.length, 1);
    assert.equal(response.body.menu.specialMenus[0].occasionName, "Diwali Celebration");
    assert.equal("createdBy" in response.body.menu.specialMenus[0], false);
    assert.deepEqual(response.body.menu.lunch.veg, ["Regular lunch"]);
    assert.equal(response.body.mealTimings.breakfast, "8:00 AM – 9:30 AM");
    assert.equal(response.body.mealTimings.teaTime, "6:00 PM – 7:00 PM");
  } finally {
    Menu.findOne = original;
  }
});

test("student preferences validate against the published special meal only", async () => {
  const originals = { menuFind: Menu.findOne, mealUpdate: Meal.findOneAndUpdate };
  const date = getNextSubmissionDate();
  Menu.findOne = () => ({ lean: async () => ({
    date,
    breakfast: { veg: ["Regular breakfast"], nonVeg: [] },
    lunch: { veg: ["Regular lunch"], nonVeg: ["Regular chicken"] },
    teaTime: { veg: ["Regular tea"], nonVeg: [] },
    dinner: { veg: ["Regular dinner"], nonVeg: [] },
    specialMenus: [{
      date,
      isPublished: true,
      lunch: { veg: ["Special Paneer"], nonVeg: [] },
    }],
  }) });
  Meal.findOneAndUpdate = async (filter, update) => ({
    studentId: filter.studentId,
    date: filter.date,
    update,
  });
  const preferences = {
    breakfast: { status: "skip", mealType: null },
    lunch: { status: "eat", mealType: "veg" },
    teaTime: { status: "skip", mealType: null },
    dinner: { status: "skip", mealType: null },
  };
  try {
    const accepted = createResponse();
    await saveMealPreferences({ user: { _id: "student-id" }, body: { date, meals: preferences } }, accepted, (error) => { throw error; });
    assert.equal(accepted.statusCode, 200);

    const rejected = createResponse();
    await saveMealPreferences({
      user: { _id: "student-id" },
      body: { date, meals: { ...preferences, lunch: { status: "eat", mealType: "nonVeg" } } },
    }, rejected, (error) => { throw error; });
    assert.equal(rejected.statusCode, 400);
    assert.match(rejected.body.message, /No non-vegetarian option/);
  } finally {
    Menu.findOne = originals.menuFind;
    Meal.findOneAndUpdate = originals.mealUpdate;
  }
});

test("admin creates a published special menu in the existing date document", async () => {
  const originals = { menuFind: Menu.findOne, menuUpdate: Menu.findOneAndUpdate };
  let capturedFilter;
  let capturedUpdate;
  const record = specialRecord({ isPublished: true });
  Menu.findOne = () => ({ select() { return this; }, lean: async () => null });
  Menu.findOneAndUpdate = async (filter, update) => {
    capturedFilter = filter;
    capturedUpdate = update;
    return { specialMenus: [{ ...update.$push.specialMenus, _id: specialId }] };
  };
  try {
    const response = createResponse();
    await createSpecialMenu({
      user: { _id: "admin-id" },
      body: {
        occasionName: "  Diwali   Celebration ",
        date: record.date,
        meals: { lunch: { veg: [" Special Paneer "], nonVeg: [] } },
        description: "Festival meal",
        isPublished: true,
      },
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 201);
    assert.equal(capturedFilter.date, record.date);
    assert.equal(capturedFilter.specialMenus.$not.$elemMatch.occasionKey, "diwali celebration");
    assert.equal(capturedUpdate.$push.specialMenus.lunch.veg[0], "Special Paneer");
    assert.equal(capturedUpdate.$push.specialMenus.createdBy, "admin-id");
    assert.equal(response.body.specialMenu.isPublished, true);
  } finally {
    Menu.findOne = originals.menuFind;
    Menu.findOneAndUpdate = originals.menuUpdate;
  }
});

test("prevents duplicate occasion/date records and overlapping published meal overrides", async () => {
  const originals = { menuFind: Menu.findOne, menuUpdate: Menu.findOneAndUpdate };
  const body = {
    occasionName: "Diwali Celebration",
    date: "2026-11-08",
    meals: { lunch: { veg: ["Festival Meal"], nonVeg: [] } },
    isPublished: true,
  };
  let writeAttempted = false;
  try {
    Menu.findOne = () => ({ select() { return this; }, lean: async () => ({
      specialMenus: [specialRecord({ occasionName: "Another Occasion" })],
    }) });
    Menu.findOneAndUpdate = async () => { writeAttempted = true; };
    const overlapResponse = createResponse();
    await createSpecialMenu({ user: { _id: "admin-id" }, body }, overlapResponse, (error) => { throw error; });
    assert.equal(overlapResponse.statusCode, 409);
    assert.equal(writeAttempted, false);

    Menu.findOne = () => ({ select() { return this; }, lean: async () => null });
    Menu.findOneAndUpdate = async () => { throw Object.assign(new Error("duplicate date index"), { code: 11000 }); };
    const duplicateResponse = createResponse();
    await createSpecialMenu({ user: { _id: "admin-id" }, body }, duplicateResponse, (error) => { throw error; });
    assert.equal(duplicateResponse.statusCode, 409);
    assert.match(duplicateResponse.body.message, /already exists/);
  } finally {
    Menu.findOne = originals.menuFind;
    Menu.findOneAndUpdate = originals.menuUpdate;
  }
});

test("admin update replaces selected meals and preserves the embedded menu identity", async () => {
  const originals = { menuFind: Menu.findOne, menuUpdate: Menu.findOneAndUpdate };
  const existing = specialRecord({ breakfast: { veg: ["Old special"], nonVeg: [] }, lunch: undefined });
  let updateDocument;
  Menu.findOne = (filter) => ({
    lean: async () => filter.date
      ? { date: filter.date, specialMenus: [existing] }
      : { date: existing.date, specialMenus: [existing] },
    select() { return this; },
  });
  Menu.findOneAndUpdate = async (_filter, update) => {
    updateDocument = update;
    return { specialMenus: [{ ...update.$set["specialMenus.$"], _id: specialId }] };
  };
  try {
    const response = createResponse();
    await updateSpecialMenu({
      params: { id: specialId },
      user: { _id: "admin-id" },
      body: {
        occasionName: "Diwali Celebration",
        date: existing.date,
        meals: { dinner: { veg: ["Festival Rice"], nonVeg: [] } },
        isPublished: false,
      },
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 200);
    assert.equal(updateDocument.$set["specialMenus.$"]._id, specialId);
    assert.equal(updateDocument.$set["specialMenus.$"].breakfast, undefined);
    assert.deepEqual(updateDocument.$set["specialMenus.$"].dinner.veg, ["Festival Rice"]);
  } finally {
    Menu.findOne = originals.menuFind;
    Menu.findOneAndUpdate = originals.menuUpdate;
  }
});

test("admin can unpublish and delete a special menu", async () => {
  const originals = { menuFind: Menu.findOne, menuUpdate: Menu.findOneAndUpdate, menuUpdateOne: Menu.updateOne };
  let publicationUpdate;
  let deletion;
  Menu.findOne = () => ({ select() { return this; }, lean: async () => ({ date: "2026-11-08", specialMenus: [specialRecord()] }) });
  Menu.findOneAndUpdate = async (_filter, update) => {
    publicationUpdate = update;
    return { specialMenus: [specialRecord({ isPublished: false })] };
  };
  Menu.updateOne = async (filter, update) => {
    deletion = { filter, update };
    return { modifiedCount: 1 };
  };
  try {
    const unpublishResponse = createResponse();
    await setSpecialMenuPublished({ params: { id: specialId }, user: { _id: "admin-id" }, body: { isPublished: false } }, unpublishResponse, (error) => { throw error; });
    assert.equal(unpublishResponse.statusCode, 200);
    assert.equal(publicationUpdate.$set["specialMenus.$.isPublished"], false);

    const deleteResponse = createResponse();
    await deleteSpecialMenu({ params: { id: specialId } }, deleteResponse, (error) => { throw error; });
    assert.equal(deleteResponse.statusCode, 200);
    assert.deepEqual(deletion.update.$pull.specialMenus, { _id: specialId });
  } finally {
    Menu.findOne = originals.menuFind;
    Menu.findOneAndUpdate = originals.menuUpdate;
    Menu.updateOne = originals.menuUpdateOne;
  }
});

test("rejects a special menu without items or with an invalid date", async () => {
  const original = Menu.findOneAndUpdate;
  let writeAttempted = false;
  Menu.findOneAndUpdate = async () => { writeAttempted = true; };
  try {
    for (const body of [
      { occasionName: "Diwali", date: "2026-11-08", meals: { lunch: { veg: [], nonVeg: [] } } },
      { occasionName: "Diwali", date: "2026-02-30", meals: { lunch: { veg: ["Kheer"], nonVeg: [] } } },
    ]) {
      const response = createResponse();
      await createSpecialMenu({ body, user: { _id: "admin-id" } }, response, (error) => { throw error; });
      assert.equal(response.statusCode, 400);
    }
    assert.equal(writeAttempted, false);
  } finally {
    Menu.findOneAndUpdate = original;
  }
});
