const assert = require("node:assert/strict");
const test = require("node:test");
const Menu = require("../backend/models/Menu");
const { updateMenu } = require("../backend/controllers/adminController");

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

function legacyMenuPayload() {
  return {
    date: "2026-10-13",
    breakfast: { veg: ["Idli"], nonVeg: [] },
    lunch: { veg: ["Rice"], nonVeg: [] },
    teaTime: { veg: ["Tea"], nonVeg: [] },
    dinner: { veg: ["Rice"], nonVeg: [] },
  };
}

test("legacy menu updates preserve saved ingredient requirements", async () => {
  const originalFindOneAndUpdate = Menu.findOneAndUpdate;
  let updateDocument;
  Menu.findOneAndUpdate = async (_filter, update) => {
    updateDocument = update;
    return { date: "2026-10-13" };
  };

  try {
    const response = createResponse();
    await updateMenu({ body: legacyMenuPayload() }, response, (error) => {
      throw error;
    });

    assert.equal(response.statusCode, 200);
    assert.equal(updateDocument.$set["breakfast.veg"][0], "Idli");
    assert.equal(
      Object.keys(updateDocument.$set).some((key) => key.endsWith(".ingredients")),
      false
    );
  } finally {
    Menu.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("menu updates reject invalid ingredient units before writing", async () => {
  const originalFindOneAndUpdate = Menu.findOneAndUpdate;
  let writeAttempted = false;
  Menu.findOneAndUpdate = async () => {
    writeAttempted = true;
  };

  try {
    const body = legacyMenuPayload();
    body.breakfast.ingredients = {
      veg: [{ name: "Rice", quantityPerServing: 100, unit: "sack" }],
      nonVeg: [],
    };
    const response = createResponse();
    await updateMenu({ body }, response, (error) => {
      throw error;
    });

    assert.equal(response.statusCode, 400);
    assert.equal(writeAttempted, false);
  } finally {
    Menu.findOneAndUpdate = originalFindOneAndUpdate;
  }
});
