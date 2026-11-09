const assert = require("node:assert/strict");
const test = require("node:test");
const InventoryItem = require("../backend/models/InventoryItem");
const {
  createInventoryItem,
  getInventory,
  recordInventoryTransaction,
  updateInventoryItem,
} = require("../backend/controllers/inventoryController");

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

test("creates inventory with opening stock attributed to the admin", async () => {
  const original = InventoryItem.create;
  let payload;
  InventoryItem.create = async (record) => {
    payload = record;
    return record;
  };
  try {
    const response = createResponse();
    await createInventoryItem({
      user: { _id: "admin-id" },
      body: { name: "Rice", quantity: 10, unit: "kg", lowStockThreshold: 2 },
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 201);
    assert.equal(payload.itemKey, "rice");
    assert.equal(payload.currentQuantity, 10);
    assert.equal(payload.transactions[0].recordedBy, "admin-id");
  } finally {
    InventoryItem.create = original;
  }
});

test("rejects invalid stock and does not persist it", async () => {
  const original = InventoryItem.create;
  let writes = 0;
  InventoryItem.create = async () => { writes += 1; };
  try {
    const response = createResponse();
    await createInventoryItem({
      user: { _id: "admin-id" },
      body: { name: "Rice", quantity: -1, unit: "kg" },
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 400);
    assert.equal(writes, 0);
  } finally {
    InventoryItem.create = original;
  }
});

test("stock use has an atomic non-negative quantity guard", async () => {
  const originals = { findById: InventoryItem.findById, findOneAndUpdate: InventoryItem.findOneAndUpdate };
  let updateFilter;
  InventoryItem.findById = () => ({ select: async () => ({ unit: "kg" }) });
  InventoryItem.findOneAndUpdate = async (filter) => {
    updateFilter = filter;
    return null;
  };
  try {
    const response = createResponse();
    await recordInventoryTransaction({
      params: { id: "507f1f77bcf86cd799439011" },
      user: { _id: "admin-id" },
      body: { type: "used", quantity: 5, unit: "kg" },
    }, response, (error) => { throw error; });
    assert.deepEqual(updateFilter.currentQuantity, { $gte: 5 });
    assert.equal(response.statusCode, 409);
  } finally {
    InventoryItem.findById = originals.findById;
    InventoryItem.findOneAndUpdate = originals.findOneAndUpdate;
  }
});

test("records stock receipt and audit identity", async () => {
  const originals = { findById: InventoryItem.findById, findOneAndUpdate: InventoryItem.findOneAndUpdate };
  let updateFilter;
  let update;
  InventoryItem.findById = () => ({ select: async () => ({ unit: "L" }) });
  InventoryItem.findOneAndUpdate = async (filter, changes) => {
    updateFilter = filter;
    update = changes;
    return { currentQuantity: 14 };
  };
  try {
    const response = createResponse();
    await recordInventoryTransaction({
      params: { id: "507f1f77bcf86cd799439011" },
      user: { _id: "admin-id" },
      body: { type: "received", quantity: 4, unit: "L", note: "Supplier delivery" },
    }, response, (error) => { throw error; });
    assert.deepEqual(updateFilter.currentQuantity, { $lte: 999999996 });
    assert.equal(update.$inc.currentQuantity, 4);
    assert.equal(update.$push.transactions.recordedBy, "admin-id");
    assert.equal(response.body.item.currentQuantity, 14);
  } finally {
    InventoryItem.findById = originals.findById;
    InventoryItem.findOneAndUpdate = originals.findOneAndUpdate;
  }
});

test("item updates preserve stock quantities", async () => {
  const original = InventoryItem.findByIdAndUpdate;
  let change;
  InventoryItem.findByIdAndUpdate = async (_id, update) => {
    change = update;
    return { currentQuantity: 8, name: update.$set.name };
  };
  try {
    const response = createResponse();
    await updateInventoryItem({
      params: { id: "507f1f77bcf86cd799439011" },
      body: { name: "Rice", lowStockThreshold: 3 },
    }, response, (error) => { throw error; });
    assert.equal(change.$set.currentQuantity, undefined);
    assert.equal(response.body.item.currentQuantity, 8);
  } finally {
    InventoryItem.findByIdAndUpdate = original;
  }
});

test("inventory filter marks low and expiring items from stored quantities", async () => {
  const original = InventoryItem.find;
  InventoryItem.find = () => ({
    sort() {
      return this;
    },
    lean: async () => [{
      name: "Rice",
      supplier: "Local",
      currentQuantity: 1,
      lowStockThreshold: 2,
      expiryDate: null,
    }],
  });
  try {
    const response = createResponse();
    await getInventory({ query: { lowStock: "true" } }, response, (error) => { throw error; });
    assert.equal(response.body.items.length, 1);
    assert.equal(response.body.items[0].isLowStock, true);
  } finally {
    InventoryItem.find = original;
  }
});
