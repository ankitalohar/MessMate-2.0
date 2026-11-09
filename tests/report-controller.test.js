const assert = require("node:assert/strict");
const test = require("node:test");
const {
  cleanCell,
  exportReport,
  getAnalytics,
  parsePeriod,
  toCsv,
} = require("../backend/controllers/reportController");
const Attendance = require("../backend/models/DiningAttendance");
const Feedback = require("../backend/models/Feedback");
const FoodDonation = require("../backend/models/FoodDonation");
const FoodPreparation = require("../backend/models/FoodPreparation");
const InventoryItem = require("../backend/models/InventoryItem");
const Meal = require("../backend/models/Meal");
const User = require("../backend/models/User");

test("neutralizes formula-leading CSV values and quotes separators", () => {
  assert.equal(cleanCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
  assert.equal(cleanCell("  +SUM(A1:A2)"), `"'  +SUM(A1:A2)"`);
  assert.equal(cleanCell("student, mess"), `"student, mess"`);
  assert.equal(toCsv(["Name", "Note"], [["=1+1", 'contains "quotes"']]), `"Name","Note"\r\n"'=1+1","contains ""quotes"""`);
});

test("validates report date ranges and keeps them bounded", () => {
  assert.deepEqual(parsePeriod({ date: "2026-10-12" }), {
    start: "2026-10-12",
    end: "2026-10-12",
    range: { $gte: "2026-10-12", $lte: "2026-10-12" },
  });
  assert.equal(parsePeriod({ from: "2025-01-01", to: "2026-10-12" }), null);
  assert.equal(parsePeriod({ date: "2026-02-30" }), null);
  assert.equal(parsePeriod({ from: "2026-10-12" }), null);
});

test("analytics reports summarize actual preferences, waste, ratings, stock, attendance and donations", async () => {
  const originals = {
    userFind: User.find,
    mealFind: Meal.find,
    preparationFind: FoodPreparation.find,
    feedbackFind: Feedback.find,
    inventoryFind: InventoryItem.find,
    attendanceFind: Attendance.find,
    donationFind: FoodDonation.find,
  };
  User.find = () => ({
    select() {
      return this;
    },
    lean: async () => [{ _id: "student-1" }],
  });
  Meal.find = () => ({
    lean: async () => [{
      date: "2026-10-12",
      breakfast: { status: "eat", mealType: "veg" },
      lunch: { status: "skip" },
      teaTime: { status: "not-selected" },
      dinner: { status: "eat", mealType: "nonVeg" },
    }],
  });
  FoodPreparation.find = () => ({ lean: async () => [{ unit: "kg", quantityPrepared: 10, quantityServed: 7, quantityDiscarded: 2, quantityDonated: 1 }] });
  Feedback.find = () => ({ lean: async () => [{ meal: "lunch", rating: 4 }] });
  InventoryItem.find = () => ({
    select() {
      return this;
    },
    lean: async () => [{
      transactions: [{ type: "used", quantity: 2, unit: "kg", createdAt: new Date("2026-10-12T12:00:00Z") }],
    }],
  });
  Attendance.find = () => ({ lean: async () => [{ date: "2026-10-12", meal: "breakfast", attendanceCount: 1 }] });
  FoodDonation.find = () => ({ lean: async () => [{ unit: "kg", donationQuantity: 1, pickupStatus: "pending" }] });
  try {
    const response = createResponse();
    await getAnalytics({ query: { date: "2026-10-12" } }, response, (error) => { throw error; });
    assert.equal(response.body.mealDemand.eat, 2);
    assert.equal(response.body.mealDemand.skip, 1);
    assert.equal(response.body.mealDemand.notSelected, 1);
    assert.equal(response.body.foodWaste[0].discarded, 2);
    assert.equal(response.body.ratings.average, 4);
    assert.deepEqual(response.body.inventoryUsage, [{ unit: "kg", quantity: 2 }]);
    assert.equal(response.body.attendance[0].expected, 1);
    assert.equal(response.body.donations.pending, 1);
  } finally {
    User.find = originals.userFind;
    Meal.find = originals.mealFind;
    FoodPreparation.find = originals.preparationFind;
    Feedback.find = originals.feedbackFind;
    InventoryItem.find = originals.inventoryFind;
    Attendance.find = originals.attendanceFind;
    FoodDonation.find = originals.donationFind;
  }
});

test("feedback CSV export neutralizes formula-like submitted text", async () => {
  const original = Feedback.find;
  Feedback.find = () => ({
    sort() {
      return this;
    },
    lean: async () => [{
      date: "2026-10-12",
      meal: "lunch",
      rating: 1,
      feedback: "=HYPERLINK(\"https://example.test\")",
      createdAt: new Date("2026-10-12T12:00:00Z"),
      reviewed: false,
    }],
  });
  try {
    const response = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      send(content) {
        this.content = content;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await exportReport({ query: { type: "feedback", date: "2026-10-12" } }, response, (error) => { throw error; });
    assert.match(response.headers["Content-Type"], /text\/csv/);
    assert.match(response.content, /"'=HYPERLINK/);
    assert.equal(response.statusCode, 200);
  } finally {
    Feedback.find = original;
  }
});

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
