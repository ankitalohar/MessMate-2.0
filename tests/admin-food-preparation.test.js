const assert = require("node:assert/strict");
const test = require("node:test");
const FoodPreparation = require("../backend/models/FoodPreparation");
const {
  getFoodPreparation,
  saveFoodPreparation,
} = require("../backend/controllers/adminController");

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

test("rejects quantities where served plus discarded exceeds prepared", async () => {
  const originalFindOneAndUpdate = FoodPreparation.findOneAndUpdate;
  let writeAttempted = false;
  FoodPreparation.findOneAndUpdate = async () => {
    writeAttempted = true;
  };

  try {
    const response = createResponse();
    await saveFoodPreparation(
      {
        user: { _id: "admin-id" },
        body: {
          date: "2026-10-13",
          meal: "lunch",
          foodItem: "Rice",
          quantityPrepared: 10,
          quantityServed: 7,
          quantityDiscarded: 4,
          unit: "kg",
        },
      },
      response,
      (error) => { throw error; }
    );

    assert.equal(response.statusCode, 400);
    assert.equal(writeAttempted, false);
  } finally {
    FoodPreparation.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("saves actual quantities with the authenticated admin and derived remainder", async () => {
  const originals = {
    findOne: FoodPreparation.findOne,
    findOneAndUpdate: FoodPreparation.findOneAndUpdate,
  };
  let savedFilter;
  let savedUpdate;
  FoodPreparation.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });
  FoodPreparation.findOneAndUpdate = async (filter, update) => {
    savedFilter = filter;
    savedUpdate = update;
    return {
      quantityPrepared: 12,
      quantityServed: 9,
      quantityDiscarded: 2,
      toObject: () => ({
        date: filter.date,
        meal: filter.meal,
        foodItem: update.$set.foodItem,
        itemKey: filter.itemKey,
        quantityPrepared: 12,
        quantityServed: 9,
        quantityDiscarded: 2,
        recordedBy: update.$set.recordedBy,
        unit: "portion",
      }),
    };
  };

  try {
    const response = createResponse();
    await saveFoodPreparation(
      {
        user: { _id: "authenticated-admin-id" },
        body: {
          date: "2026-10-13",
          meal: "dinner",
          foodItem: "  Rice  ",
          quantityPrepared: 12,
          quantityServed: 9,
          quantityDiscarded: 2,
          unit: "portion",
        },
      },
      response,
      (error) => { throw error; }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(savedFilter.itemKey, "rice");
    assert.equal(savedUpdate.$set.recordedBy, "authenticated-admin-id");
    assert.equal(savedUpdate.$set.quantityDiscarded, 2);
    assert.equal(response.body.record.quantityRemaining, 3);
    assert.equal(response.body.record.quantityUnaccounted, 1);
  } finally {
    FoodPreparation.findOne = originals.findOne;
    FoodPreparation.findOneAndUpdate = originals.findOneAndUpdate;
  }
});

test("summarizes saved preparations by unit without combining unlike measurements", async () => {
  const originalFind = FoodPreparation.find;
  let queryFilter;
  FoodPreparation.find = (filter) => {
    queryFilter = filter;
    return {
      sort() {
        return this;
      },
      lean: async () => [
        {
          _id: "record-1",
          date: "2026-10-13",
          meal: "lunch",
          foodItem: "Rice",
          quantityPrepared: 10,
          quantityServed: 7,
          quantityDiscarded: 2,
          unit: "kg",
        },
        {
          _id: "record-2",
          date: "2026-10-13",
          meal: "dinner",
          foodItem: "Milk",
          quantityPrepared: 5,
          quantityServed: 4,
          quantityDiscarded: 1,
          unit: "L",
        },
      ],
    };
  };

  try {
    const response = createResponse();
    await getFoodPreparation(
      { query: { date: "2026-10-13" } },
      response,
      (error) => { throw error; }
    );

    assert.deepEqual(queryFilter, { date: "2026-10-13" });
    assert.equal(response.body.records[0].quantityRemaining, 3);
    assert.equal(response.body.records[0].quantityUnaccounted, 1);
    assert.deepEqual(response.body.totalsByUnit, [
      {
        unit: "kg",
        quantityPrepared: 10,
        quantityServed: 7,
        quantityRemaining: 3,
        quantityDiscarded: 2,
        quantityDonated: 0,
        discardedPercentage: 20,
      },
      {
        unit: "L",
        quantityPrepared: 5,
        quantityServed: 4,
        quantityRemaining: 1,
        quantityDiscarded: 1,
        quantityDonated: 0,
        discardedPercentage: 20,
      },
    ]);
    assert.deepEqual(response.body.dailyTotalsByUnit, [
      {
        date: "2026-10-13",
        unit: "kg",
        quantityPrepared: 10,
        quantityServed: 7,
        quantityRemaining: 3,
        quantityDiscarded: 2,
        quantityDonated: 0,
        discardedPercentage: 20,
      },
      {
        date: "2026-10-13",
        unit: "L",
        quantityPrepared: 5,
        quantityServed: 4,
        quantityRemaining: 1,
        quantityDiscarded: 1,
        quantityDonated: 0,
        discardedPercentage: 20,
      },
    ]);
    assert.deepEqual(response.body.mostDiscardedItems, [
      {
        foodItem: "Rice",
        unit: "kg",
        quantityPrepared: 10,
        quantityServed: 7,
        quantityRemaining: 3,
        quantityDiscarded: 2,
        quantityDonated: 0,
        discardedPercentage: 20,
      },
      {
        foodItem: "Milk",
        unit: "L",
        quantityPrepared: 5,
        quantityServed: 4,
        quantityRemaining: 1,
        quantityDiscarded: 1,
        quantityDonated: 0,
        discardedPercentage: 20,
      },
    ]);
  } finally {
    FoodPreparation.find = originalFind;
  }
});

test("rejects invalid food preparation date ranges", async () => {
  const originalFind = FoodPreparation.find;
  let queryAttempted = false;
  FoodPreparation.find = () => {
    queryAttempted = true;
    return { sort() { return this; }, lean: async () => [] };
  };

  try {
    const response = createResponse();
    await getFoodPreparation(
      { query: { from: "2025-01-01", to: "2026-10-13" } },
      response,
      (error) => { throw error; }
    );
    assert.equal(response.statusCode, 400);
    assert.equal(queryAttempted, false);
  } finally {
    FoodPreparation.find = originalFind;
  }
});
