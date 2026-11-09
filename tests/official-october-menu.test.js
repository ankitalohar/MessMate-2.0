const assert = require("node:assert/strict");
const test = require("node:test");
const Menu = require("../backend/models/Menu");
const {
  buildOfficialNovemberMenus,
  buildOfficialOctoberMenus,
  seedOfficialNovemberMenus,
  seedOfficialOctoberMenus,
} = require("../backend/utils/officialOctoberMenu");

test("builds a menu record for every date in October 2026", () => {
  const menus = buildOfficialOctoberMenus();

  assert.equal(menus.length, 31);
  assert.equal(menus[0].date, "2026-10-01");
  assert.equal(menus.at(-1).date, "2026-10-31");
  assert.ok(menus.every((menu) => menu.breakfast && menu.lunch && menu.teaTime && menu.dinner));
});

test("marks the provided holiday and leaves unspecified Saturday dishes blank", () => {
  const menus = buildOfficialOctoberMenus();
  const holiday = menus.find((menu) => menu.date === "2026-10-02");
  const saturday = menus.find((menu) => menu.date === "2026-10-03");

  assert.equal(holiday.isHoliday, true);
  assert.deepEqual(saturday.breakfast, { veg: [], nonVeg: [] });
  assert.deepEqual(saturday.lunch, { veg: [], nonVeg: [] });
  assert.deepEqual(saturday.teaTime, { veg: [], nonVeg: [] });
  assert.deepEqual(saturday.dinner, { veg: [], nonVeg: [] });
});

test("seeds missing menu dates without overwriting existing administrator menus", async () => {
  const originalBulkWrite = Menu.bulkWrite;
  let operations;
  let options;
  Menu.bulkWrite = async (bulkOperations, bulkOptions) => {
    operations = bulkOperations;
    options = bulkOptions;
  };

  try {
    await seedOfficialOctoberMenus();
  } finally {
    Menu.bulkWrite = originalBulkWrite;
  }

  assert.equal(operations.length, 31);
  assert.deepEqual(options, { ordered: false });
  assert.ok(operations.every(({ updateOne }) =>
    updateOne.upsert === true &&
    Object.keys(updateOne.update).length === 1 &&
    updateOne.update.$setOnInsert.date === updateOne.filter.date
  ));
});

test("builds all November 2026 weekly menus from the supplied weekday schedule", () => {
  const menus = buildOfficialNovemberMenus();
  assert.equal(menus.length, 30);
  assert.equal(menus[0].date, "2026-11-01");
  assert.equal(menus.at(-1).date, "2026-11-30");

  const sunday = menus.find((menu) => menu.date === "2026-11-01");
  const monday = menus.find((menu) => menu.date === "2026-11-02");
  const tuesday = menus.find((menu) => menu.date === "2026-11-03");
  const wednesday = menus.find((menu) => menu.date === "2026-11-04");
  const thursday = menus.find((menu) => menu.date === "2026-11-05");
  const friday = menus.find((menu) => menu.date === "2026-11-06");
  const saturday = menus.find((menu) => menu.date === "2026-11-07");

  assert.deepEqual(sunday.breakfast.veg, ["Chakuli", "Khuda Upma", "Ghuguni"]);
  assert.deepEqual(sunday.lunch.nonVeg, ["Fish Masala"]);
  assert.deepEqual(monday.breakfast.veg, ["Poha", "Aloo Matar Curry"]);
  assert.deepEqual(monday.lunch.veg, ["Rice", "Dal", "Dalma", "Veg Curry", "Fryums"]);
  assert.deepEqual(tuesday.dinner.nonVeg, ["Egg Tadka"]);
  assert.deepEqual(tuesday.dinner.veg, ["Zeera Rice", "Dal", "Roti", "Veg Tadka", "Kheer"]);
  assert.deepEqual(wednesday.breakfast.veg, ["Roti", "Buta Aloo Curry"]);
  assert.deepEqual(thursday.lunch.nonVeg, ["Egg Masala"]);
  assert.deepEqual(friday.lunch.veg, ["Rice", "Dal", "Veg Fry", "Cauliflower and Green Peas Curry"]);
  assert.deepEqual(saturday.breakfast.veg, ["Dahibara Aloo Dum", "Ghuguni Chaat"]);
  assert.deepEqual(saturday.dinner.veg, ["Fried Rice", "Roti", "Dal", "Guguni", "Semiya Khiri"]);
});

test("seeds only missing November menu dates", async () => {
  const originalBulkWrite = Menu.bulkWrite;
  let operations;
  Menu.bulkWrite = async (bulkOperations) => { operations = bulkOperations; };
  try {
    await seedOfficialNovemberMenus();
  } finally {
    Menu.bulkWrite = originalBulkWrite;
  }
  assert.equal(operations.length, 30);
  assert.ok(operations.every(({ updateOne }) =>
    updateOne.upsert === true &&
    Object.keys(updateOne.update).length === 1 &&
    updateOne.update.$setOnInsert.date === updateOne.filter.date
  ));
});
