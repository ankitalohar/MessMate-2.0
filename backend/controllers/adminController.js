const mongoose = require("mongoose");
const FoodPreparation = require("../models/FoodPreparation");
const Meal = require("../models/Meal");
const Menu = require("../models/Menu");
const Notification = require("../models/Notification");
const {
  getApprovedActiveStudentRecipients,
  sendAnnouncementToRecipients,
  safeErrorCode,
  getSmtpFailureMessage,
} = require("../services/emailServices");
const User = require("../models/User");
const { getDateKey, isValidDateKey } = require("../utils/date");

const MEAL_NAMES = ["breakfast", "lunch", "teaTime", "dinner"];
const MEAL_STATUSES = ["eat", "skip", "not-selected"];
const MEAL_TYPES = ["veg", "nonVeg"];
const INGREDIENT_UNITS = ["g", "kg", "ml", "L", "piece"];
const FOOD_QUANTITY_UNITS = ["g", "kg", "ml", "L", "piece", "portion"];

function normalizeOccasionKey(value) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function requestedDate(value) {
  const date = value || getDateKey();
  return isValidDateKey(date) ? date : null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePagination(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= maximum ? parsed : null;
}

function validateMenu(menu, date) {
  if (!menu || typeof menu !== "object" || Array.isArray(menu)) return null;
  const normalized = {
    date,
    isHoliday: menu.isHoliday === true,
  };
  for (const mealName of MEAL_NAMES) {
    const meal = menu[mealName];
    if (!meal || typeof meal !== "object" || Array.isArray(meal)) return null;
    normalized[mealName] = {};
    for (const mealType of MEAL_TYPES) {
      const items = meal[mealType];
      if (
        !Array.isArray(items) ||
        items.length > 30 ||
        items.some(
          (item) => typeof item !== "string" || !item.trim() || item.trim().length > 80
        )
      ) {
        return null;
      }
      normalized[mealName][mealType] = items.map((item) => item.trim());
    }
    if (Object.hasOwn(meal, "ingredients")) {
      if (!meal.ingredients || typeof meal.ingredients !== "object" || Array.isArray(meal.ingredients)) {
        return null;
      }
      normalized[mealName].ingredients = {};
      for (const mealType of MEAL_TYPES) {
        const ingredients = meal.ingredients[mealType];
        if (!Array.isArray(ingredients) || ingredients.length > 40) return null;
        const normalizedIngredients = [];
        const ingredientKeys = new Set();
        for (const ingredient of ingredients) {
          if (
            !ingredient ||
            typeof ingredient !== "object" ||
            Array.isArray(ingredient) ||
            typeof ingredient.name !== "string" ||
            !ingredient.name.trim() ||
            ingredient.name.trim().length > 80 ||
            typeof ingredient.quantityPerServing !== "number" ||
            !Number.isFinite(ingredient.quantityPerServing) ||
            ingredient.quantityPerServing <= 0 ||
            ingredient.quantityPerServing > 1000000 ||
            !INGREDIENT_UNITS.includes(ingredient.unit)
          ) {
            return null;
          }
          const name = ingredient.name.trim();
          const key = `${name.toLocaleLowerCase()}|${ingredient.unit}`;
          if (ingredientKeys.has(key)) return null;
          ingredientKeys.add(key);
          normalizedIngredients.push({
            name,
            quantityPerServing: ingredient.quantityPerServing,
            unit: ingredient.unit,
          });
        }
        normalized[mealName].ingredients[mealType] = normalizedIngredients;
      }
    }
  }
  return normalized;
}

function validateSpecialMenu(body) {
  const date = body?.date;
  const occasionName = typeof body?.occasionName === "string"
    ? body.occasionName.trim().replace(/\s+/g, " ")
    : "";
  const description = body?.description === undefined ? "" : body.description;
  if (
    !isValidDateKey(date) ||
    occasionName.length < 2 ||
    occasionName.length > 100 ||
    typeof description !== "string" ||
    description.length > 1000 ||
    (body?.isPublished !== undefined && typeof body.isPublished !== "boolean") ||
    !body?.meals ||
    typeof body.meals !== "object" ||
    Array.isArray(body.meals)
  ) return null;

  const meals = {};
  for (const mealName of MEAL_NAMES) {
    if (!Object.hasOwn(body.meals, mealName)) continue;
    const meal = body.meals[mealName];
    if (!meal || typeof meal !== "object" || Array.isArray(meal)) return null;
    const normalizedMeal = {};
    for (const mealType of MEAL_TYPES) {
      const items = meal[mealType];
      if (
        !Array.isArray(items) ||
        items.length > 30 ||
        items.some((item) => typeof item !== "string" || !item.trim() || item.trim().length > 80)
      ) return null;
      normalizedMeal[mealType] = items.map((item) => item.trim());
    }
    if (!normalizedMeal.veg.length && !normalizedMeal.nonVeg.length) return null;
    meals[mealName] = normalizedMeal;
  }
  if (!Object.keys(meals).length) return null;
  return {
    date,
    occasionName,
    occasionKey: normalizeOccasionKey(occasionName),
    meals,
    description: description.trim(),
    isPublished: body.isPublished === true,
  };
}

function specialMenuMealConflict(specialMenus, meals, excludeId) {
  return (specialMenus || []).some((special) =>
    special.isPublished &&
    String(special._id) !== String(excludeId || "") &&
    Object.keys(meals).some((mealName) => Object.hasOwn(special, mealName))
  );
}

async function getSpecialMenuConflict(date, meals, excludeId) {
  const menu = await Menu.findOne({ date }).select("specialMenus").lean();
  return menu && specialMenuMealConflict(menu.specialMenus, meals, excludeId);
}

function specialMenuFromDocument(menu, id) {
  return menu?.specialMenus?.find((special) => String(special._id) === String(id)) || null;
}

function specialMenuDocumentFields(specialMenu) {
  const { meals, ...fields } = specialMenu;
  return { ...fields, ...meals };
}

async function createSpecialMenu(req, res, next) {
  try {
    const specialMenu = validateSpecialMenu(req.body);
    if (!specialMenu) {
      res.status(400).json({ message: "Provide an occasion, valid date, at least one meal with food items, and a valid description." });
      return;
    }
    if (specialMenu.isPublished && await getSpecialMenuConflict(specialMenu.date, specialMenu.meals)) {
      res.status(409).json({ message: "A published special menu already changes one or more of these meals on this date." });
      return;
    }
    const specialDocument = {
      ...specialMenuDocumentFields(specialMenu),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    };
    let menu;
    try {
      menu = await Menu.findOneAndUpdate(
        {
          date: specialMenu.date,
          specialMenus: { $not: { $elemMatch: { occasionKey: specialMenu.occasionKey } } },
        },
        { $setOnInsert: { date: specialMenu.date }, $push: { specialMenus: specialDocument } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error.code === 11000) {
        res.status(409).json({ message: "A special menu with this occasion already exists for that date." });
        return;
      }
      throw error;
    }
    res.status(201).json({ specialMenu: specialMenuFromDocument(menu, menu.specialMenus.at(-1)._id) });
  } catch (error) {
    next(error);
  }
}

async function updateSpecialMenu(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ message: "Provide a valid special menu ID." });
      return;
    }
    const specialMenu = validateSpecialMenu(req.body);
    if (!specialMenu) {
      res.status(400).json({ message: "Provide an occasion, valid date, at least one meal with food items, and a valid description." });
      return;
    }
    const sourceMenu = await Menu.findOne({ "specialMenus._id": req.params.id }).lean();
    const existing = specialMenuFromDocument(sourceMenu, req.params.id);
    if (!existing) {
      res.status(404).json({ message: "Special menu was not found." });
      return;
    }
    if (specialMenu.isPublished && await getSpecialMenuConflict(specialMenu.date, specialMenu.meals, req.params.id)) {
      res.status(409).json({ message: "A published special menu already changes one or more of these meals on this date." });
      return;
    }
    const replacement = {
      ...specialMenuDocumentFields(specialMenu),
      _id: existing._id,
      createdBy: existing.createdBy,
      updatedBy: req.user._id,
      createdAt: existing.createdAt,
    };
    if (specialMenu.date === sourceMenu.date) {
      const updated = await Menu.findOneAndUpdate(
        {
          date: sourceMenu.date,
          "specialMenus._id": req.params.id,
          specialMenus: {
            $not: {
              $elemMatch: {
                occasionKey: specialMenu.occasionKey,
                _id: { $ne: new mongoose.Types.ObjectId(req.params.id) },
              },
            },
          },
        },
        { $set: { "specialMenus.$": replacement } },
        { new: true, runValidators: true }
      );
      if (!updated) {
        res.status(409).json({ message: "A special menu with this occasion already exists for that date." });
        return;
      }
      res.json({ specialMenu: specialMenuFromDocument(updated, req.params.id) });
      return;
    }

    let targetMenu;
    try {
      targetMenu = await Menu.findOneAndUpdate(
        {
          date: specialMenu.date,
          specialMenus: { $not: { $elemMatch: { occasionKey: specialMenu.occasionKey } } },
        },
        { $setOnInsert: { date: specialMenu.date }, $push: { specialMenus: replacement } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error.code === 11000) {
        res.status(409).json({ message: "A special menu with this occasion already exists for that date." });
        return;
      }
      throw error;
    }
    const removed = await Menu.updateOne(
      { date: sourceMenu.date },
      { $pull: { specialMenus: { _id: existing._id } } }
    );
    if (!removed.modifiedCount) {
      await Menu.updateOne(
        { date: specialMenu.date },
        { $pull: { specialMenus: { _id: existing._id } } }
      );
      res.status(409).json({ message: "The special menu changed while it was being updated. Reload and try again." });
      return;
    }
    res.json({ specialMenu: specialMenuFromDocument(targetMenu, req.params.id) });
  } catch (error) {
    next(error);
  }
}

async function setSpecialMenuPublished(req, res, next) {
  try {
    const { isPublished } = req.body || {};
    if (!mongoose.isValidObjectId(req.params.id) || typeof isPublished !== "boolean") {
      res.status(400).json({ message: "Provide a valid special menu ID and publication status." });
      return;
    }
    const menu = await Menu.findOne({ "specialMenus._id": req.params.id }).select("date specialMenus").lean();
    const existing = specialMenuFromDocument(menu, req.params.id);
    if (!existing) {
      res.status(404).json({ message: "Special menu was not found." });
      return;
    }
    const meals = Object.fromEntries(MEAL_NAMES.filter((mealName) => existing[mealName]).map((mealName) => [mealName, existing[mealName]]));
    if (isPublished && await getSpecialMenuConflict(menu.date, meals, req.params.id)) {
      res.status(409).json({ message: "Another published special menu already changes one or more of these meals on this date." });
      return;
    }
    const updated = await Menu.findOneAndUpdate(
      { date: menu.date, "specialMenus._id": req.params.id },
      { $set: { "specialMenus.$.isPublished": isPublished, "specialMenus.$.updatedBy": req.user._id } },
      { new: true, runValidators: true }
    );
    res.json({ specialMenu: specialMenuFromDocument(updated, req.params.id) });
  } catch (error) {
    next(error);
  }
}

async function deleteSpecialMenu(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ message: "Provide a valid special menu ID." });
      return;
    }
    const result = await Menu.updateOne(
      { "specialMenus._id": req.params.id },
      { $pull: { specialMenus: { _id: req.params.id } } }
    );
    if (!result.modifiedCount) {
      res.status(404).json({ message: "Special menu was not found." });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function loadDailyRows(date) {
  const students = await User.find({ role: "student" })
    .select("_id name email mobile isActive createdAt lastLoginAt")
    .sort({ name: 1 })
    .lean();
  const studentIds = students.map((student) => student._id);
  const records = studentIds.length
    ? await Meal.find({ date, studentId: { $in: studentIds } }).lean()
    : [];
  const recordsByStudent = new Map(
    records.map((record) => [record.studentId.toString(), record])
  );
  return students.map((student) => ({
    student,
    record: recordsByStudent.get(student._id.toString()),
  }));
}

function emptyCounts() {
  return { eat: 0, skip: 0, notSelected: 0, veg: 0, nonVeg: 0, incomplete: 0 };
}

function summarize(rows) {
  const activeRows = rows.filter(({ student }) => student.isActive);
  const meals = Object.fromEntries(MEAL_NAMES.map((name) => [name, emptyCounts()]));
  for (const { record } of activeRows) {
    for (const mealName of MEAL_NAMES) {
      const choice = record?.[mealName] || { status: "not-selected", mealType: null };
      const statusKey = choice.status === "not-selected" ? "notSelected" : choice.status;
      meals[mealName][statusKey] += 1;
      if (choice.status === "eat") {
        if (MEAL_TYPES.includes(choice.mealType)) {
          meals[mealName][choice.mealType] += 1;
        } else {
          meals[mealName].incomplete += 1;
        }
      }
    }
  }
  const totals = emptyCounts();
  for (const mealName of MEAL_NAMES) {
    for (const key of Object.keys(totals)) totals[key] += meals[mealName][key];
  }
  return { totalStudents: activeRows.length, meals, totals };
}

async function getUsers(req, res, next) {
  try {
    const { search = "", role = "all", status = "all" } = req.query;
    const page = parsePagination(req.query.page, 1, 10000);
    const limit = parsePagination(req.query.limit, 25, 100);
    if (
      typeof search !== "string" ||
      search.length > 100 ||
      !["all", "student", "admin"].includes(role) ||
      !["all", "active", "inactive"].includes(status) ||
      !page ||
      !limit
    ) {
      res.status(400).json({ message: "One or more user filters are invalid." });
      return;
    }

    const filter = {};
    if (role !== "all") filter.role = role;
    if (status !== "all") filter.isActive = status === "active";
    if (search.trim()) {
      const searchTerm = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [{ name: searchTerm }, { email: searchTerm }, { mobile: searchTerm }];
    }
    const [users, total] = await Promise.all([
      User.find(filter)
        .select("_id name email mobile role isActive hostel room createdAt lastLoginAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    res.json({ users, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

async function getMeals(req, res, next) {
  try {
    const date = requestedDate(req.query.date);
    const mealFilter = req.query.meal || "";
    const statusFilter = req.query.status || "";
    const typeFilter = req.query.mealType || "";
    if (
      !date ||
      (mealFilter && !MEAL_NAMES.includes(mealFilter)) ||
      (statusFilter && !MEAL_STATUSES.includes(statusFilter)) ||
      (typeFilter && !MEAL_TYPES.includes(typeFilter)) ||
      (typeFilter && statusFilter && statusFilter !== "eat")
    ) {
      res.status(400).json({ message: "One or more meal filters are invalid." });
      return;
    }

    const rows = await loadDailyRows(date);
    const meals = rows
      .map(({ student, record }) => {
        const choices = Object.fromEntries(
          MEAL_NAMES.map((mealName) => [
            mealName,
            record?.[mealName] || { status: "not-selected", mealType: null },
          ])
        );
        return {
          student: {
            id: student._id,
            name: student.name,
            email: student.email,
            mobile: student.mobile,
            isActive: student.isActive,
          },
          ...choices,
        };
      })
      .filter((row) => {
        const names = mealFilter ? [mealFilter] : MEAL_NAMES;
        return names.some((name) => {
          const choice = row[name];
          return (
            (!statusFilter || choice.status === statusFilter) &&
            (!typeFilter || choice.mealType === typeFilter)
          );
        });
      });
    res.json({ date, meals });
  } catch (err) {
    next(err);
  }
}

async function getStatistics(req, res, next) {
  try {
    const date = requestedDate(req.query.date);
    if (!date) {
      res.status(400).json({ message: "Please provide a valid date (YYYY-MM-DD)." });
      return;
    }
    const summary = summarize(await loadDailyRows(date));
    res.json({ date, ...summary });
  } catch (err) {
    next(err);
  }
}

async function getFoodQuantity(req, res, next) {
  try {
    const date = requestedDate(req.query.date);
    const bufferPercent =
      req.query.bufferPercent === undefined ? 0 : Number(req.query.bufferPercent);
    if (!date || !Number.isFinite(bufferPercent) || bufferPercent < 0 || bufferPercent > 100) {
      res.status(400).json({
        message: "Use a valid date and a buffer percentage from 0 to 100.",
      });
      return;
    }
    const [summary, menu] = await Promise.all([
      loadDailyRows(date).then(summarize),
      Menu.findOne({ date }).lean(),
    ]);
    const quantities = Object.fromEntries(
      MEAL_NAMES.map((mealName) => {
        const counts = summary.meals[mealName];
        const vegRecommended = Math.ceil(counts.veg * (1 + bufferPercent / 100));
        const nonVegRecommended = Math.ceil(counts.nonVeg * (1 + bufferPercent / 100));
        const bufferVeg = vegRecommended - counts.veg;
        const bufferNonVeg = nonVegRecommended - counts.nonVeg;
        const ingredientMap = new Map();
        let unconfiguredVegServings = 0;
        let unconfiguredNonVegServings = 0;
        for (const mealType of MEAL_TYPES) {
          const servings = counts[mealType];
          const ingredientList = menu?.[mealName]?.ingredients?.[mealType];
          if (!Array.isArray(ingredientList) || ingredientList.length === 0) {
            if (mealType === "veg") unconfiguredVegServings = servings;
            else unconfiguredNonVegServings = servings;
            continue;
          }
          for (const ingredient of ingredientList) {
            const key = `${ingredient.name.toLocaleLowerCase()}|${ingredient.unit}`;
            const estimate = ingredientMap.get(key) || {
              name: ingredient.name,
              unit: ingredient.unit,
              baseQuantity: 0,
            };
            estimate.baseQuantity += servings * ingredient.quantityPerServing;
            ingredientMap.set(key, estimate);
          }
        }
        const ingredients = Array.from(ingredientMap.values()).map((ingredient) => {
          const plannedQuantity = Math.ceil(
            ingredient.baseQuantity * (1 + bufferPercent / 100)
          );
          return {
            ...ingredient,
            bufferQuantity: plannedQuantity - ingredient.baseQuantity,
            plannedQuantity,
          };
        });
        return [
          mealName,
          {
            confirmedVeg: counts.veg,
            confirmedNonVeg: counts.nonVeg,
            confirmedTotal: counts.eat,
            categorizedConfirmedTotal: counts.veg + counts.nonVeg,
            skipped: counts.skip,
            notSelected: counts.notSelected,
            incomplete: counts.incomplete,
            bufferPercent,
            bufferVeg,
            bufferNonVeg,
            bufferTotal: bufferVeg + bufferNonVeg,
            recommendedVeg: vegRecommended,
            recommendedNonVeg: nonVegRecommended,
            recommendedTotal: vegRecommended + nonVegRecommended,
            ingredients,
            unconfiguredVegServings,
            unconfiguredNonVegServings,
          },
        ];
      })
    );
    res.json({ date, totalStudents: summary.totalStudents, meals: quantities });
  } catch (err) {
    next(err);
  }
}

function validDateRange(from, to) {
  if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) return false;
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  return (toDate - fromDate) / 86400000 <= 365;
}

function summarizeFoodPreparation(records) {
  const byUnit = new Map();
  for (const record of records) {
    const values = byUnit.get(record.unit) || {
      unit: record.unit,
      quantityPrepared: 0,
      quantityServed: 0,
      quantityRemaining: 0,
      quantityDiscarded: 0,
    };
    values.quantityPrepared += record.quantityPrepared;
    values.quantityServed += record.quantityServed;
    values.quantityRemaining += record.quantityPrepared - record.quantityServed;
    values.quantityDiscarded += record.quantityDiscarded || 0;
    byUnit.set(record.unit, values);
  }
  return Array.from(byUnit.values()).map((values) => ({
    ...values,
    discardedPercentage: values.quantityPrepared > 0
      ? (values.quantityDiscarded / values.quantityPrepared) * 100
      : 0,
  }));
}

function summarizePreparationBy(records, keyFor, labelFor) {
  const groups = new Map();
  for (const record of records) {
    const key = keyFor(record);
    const values = groups.get(key) || {
      ...labelFor(record),
      quantityPrepared: 0,
      quantityServed: 0,
      quantityRemaining: 0,
      quantityDiscarded: 0,
    };
    values.quantityPrepared += record.quantityPrepared;
    values.quantityServed += record.quantityServed;
    values.quantityRemaining += record.quantityPrepared - record.quantityServed;
    values.quantityDiscarded += record.quantityDiscarded || 0;
    groups.set(key, values);
  }
  return Array.from(groups.values())
    .map((values) => ({
      ...values,
      discardedPercentage: values.quantityPrepared > 0
        ? (values.quantityDiscarded / values.quantityPrepared) * 100
        : 0,
    }))
    .sort((left, right) =>
      right.quantityDiscarded - left.quantityDiscarded ||
      String(left.date || left.foodItem).localeCompare(String(right.date || right.foodItem))
    );
}

async function getFoodPreparation(req, res, next) {
  try {
    const { date, from, to, meal = "" } = req.query;
    if (
      (date && (from || to)) ||
      (date && !isValidDateKey(date)) ||
      (!date && (Boolean(from) !== Boolean(to))) ||
      (!date && from && !validDateRange(from, to)) ||
      (meal && !MEAL_NAMES.includes(meal))
    ) {
      res.status(400).json({
        message: "Provide a valid date or a valid date range of at most 366 days, and an optional valid meal.",
      });
      return;
    }
    const filter = date
      ? { date }
      : from
        ? { date: { $gte: from, $lte: to } }
        : { date: getDateKey() };
    if (meal) filter.meal = meal;
    const records = await FoodPreparation.find(filter)
      .sort({ date: -1, meal: 1, foodItem: 1 })
      .lean();
    res.json({
      from: date || from || filter.date,
      to: date || to || filter.date,
      records: records.map((record) => ({
        ...record,
        quantityRemaining: record.quantityPrepared - record.quantityServed,
        quantityUnaccounted:
          record.quantityPrepared - record.quantityServed - (record.quantityDiscarded || 0),
      })),
      totalsByUnit: summarizeFoodPreparation(records),
      dailyTotalsByUnit: summarizePreparationBy(
        records,
        (record) => `${record.date}|${record.unit}`,
        (record) => ({ date: record.date, unit: record.unit })
      ),
      mostDiscardedItems: summarizePreparationBy(
        records,
        (record) => `${record.itemKey}|${record.unit}`,
        (record) => ({ foodItem: record.foodItem, unit: record.unit })
      ).slice(0, 10),
    });
  } catch (err) {
    next(err);
  }
}

async function saveFoodPreparation(req, res, next) {
  try {
    const {
      date,
      meal,
      foodItem,
      quantityPrepared,
      quantityServed,
      quantityDiscarded = 0,
      unit,
      reason = "",
      notes = "",
    } = req.body || {};
    if (
      !isValidDateKey(date) ||
      !MEAL_NAMES.includes(meal) ||
      typeof foodItem !== "string" ||
      !foodItem.trim() ||
      foodItem.trim().length > 80 ||
      typeof quantityPrepared !== "number" ||
      !Number.isFinite(quantityPrepared) ||
      quantityPrepared < 0 ||
      quantityPrepared > 1000000000 ||
      typeof quantityServed !== "number" ||
      !Number.isFinite(quantityServed) ||
      quantityServed < 0 ||
      quantityServed > quantityPrepared ||
      typeof quantityDiscarded !== "number" ||
      !Number.isFinite(quantityDiscarded) ||
      quantityDiscarded < 0 ||
      quantityDiscarded > quantityPrepared - quantityServed ||
      !FOOD_QUANTITY_UNITS.includes(unit) ||
      typeof reason !== "string" ||
      reason.length > 300 ||
      typeof notes !== "string" ||
      notes.length > 2000
    ) {
      res.status(400).json({
        message: "Provide a valid date, meal, food item, unit, and non-negative quantities; served quantity cannot exceed prepared quantity.",
      });
      return;
    }
    const normalizedName = foodItem.trim();
    const filter = {
      date,
      meal,
      itemKey: normalizedName.toLowerCase(),
    };
    if (quantityServed + quantityDiscarded > quantityPrepared) {
      res.status(400).json({
        message: "Prepared quantity must cover served and discarded quantities.",
      });
      return;
    }
    const update = {
      $set: {
        ...filter,
        foodItem: normalizedName,
        quantityPrepared,
        quantityServed,
        quantityDiscarded,
        unit,
        reason: reason.trim(),
        notes: notes.trim(),
        recordedBy: req.user._id,
      },
    };
    let record;
    try {
      record = await FoodPreparation.findOneAndUpdate(filter, update, {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      record = await FoodPreparation.findOneAndUpdate(filter, update, {
        new: true,
        runValidators: true,
      });
    }
    res.json({
      record: {
        ...record.toObject(),
        quantityRemaining: record.quantityPrepared - record.quantityServed,
        quantityUnaccounted:
          record.quantityPrepared - record.quantityServed - record.quantityDiscarded,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getMenu(req, res, next) {
  try {
    const date = requestedDate(req.query.date);
    if (!date) {
      res.status(400).json({ message: "Please provide a valid menu date (YYYY-MM-DD)." });
      return;
    }
    const menu = await Menu.findOne({ date }).lean();
    res.json({ date, menu });
  } catch (err) {
    next(err);
  }
}

function menuPayload(req, res) {
  const date = requestedDate(req.body?.date);
  const menu = validateMenu(req.body, date);
  if (!date || !menu) {
    res.status(400).json({
      message: "Provide a valid date and veg/non-veg menu item lists for all four meals.",
    });
    return null;
  }
  return menu;
}

async function createMenu(req, res, next) {
  try {
    const menu = menuPayload(req, res);
    if (!menu) return;
    const existing = await Menu.exists({ date: menu.date });
    if (existing) {
      res.status(409).json({ message: "A menu already exists for this date. Update it instead." });
      return;
    }
    try {
      const created = await Menu.create(menu);
      res.status(201).json({ menu: created });
    } catch (err) {
      if (err.code === 11000) {
        res.status(409).json({ message: "A menu already exists for this date. Update it instead." });
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

async function updateMenu(req, res, next) {
  try {
    const menu = menuPayload(req, res);
    if (!menu) return;
    const fieldsToUpdate = {
      date: menu.date,
      isHoliday: menu.isHoliday,
    };
    for (const mealName of MEAL_NAMES) {
      fieldsToUpdate[`${mealName}.veg`] = menu[mealName].veg;
      fieldsToUpdate[`${mealName}.nonVeg`] = menu[mealName].nonVeg;
      if (Object.hasOwn(menu[mealName], "ingredients")) {
        fieldsToUpdate[`${mealName}.ingredients`] = menu[mealName].ingredients;
      }
    }
    const updated = await Menu.findOneAndUpdate(
      { date: menu.date },
      { $set: fieldsToUpdate },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ menu: updated });
  } catch (err) {
    next(err);
  }
}

async function updateUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { isActive } = req.body || {};
    if (!mongoose.isValidObjectId(id) || typeof isActive !== "boolean") {
      res.status(400).json({ message: "Provide a valid user ID and active status." });
      return;
    }
    if (req.user._id.toString() === id.toLowerCase() && !isActive) {
      res.status(400).json({ message: "You cannot deactivate your own admin account." });
      return;
    }
    const user = await User.findByIdAndUpdate(
      id,
      { $set: { isActive } },
      { new: true, runValidators: true }
    ).select("_id name email mobile role isActive createdAt lastLoginAt");
    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function getAdminNotifications(_req, res, next) {
  try {
    const notifications = await Notification.find()
      .select("subject message kind published audience recipientIds expiresAt recipientCount sentCount failedCount totalApprovedStudents registeredEmailAddresses skippedCount inAppCount inAppStatus deliveryStatus emailResults createdAt")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
}

async function createAnnouncement(req, res, next) {
  try {
    const { subject, message, expiresAt = null, recipientIds = [] } = req.body || {};
    const expires = expiresAt === null || expiresAt === "" ? null : new Date(expiresAt);
    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      subject.trim().length > 160 ||
      typeof message !== "string" ||
      !message.trim() ||
      message.trim().length > 10000 ||
      (expiresAt && (!Number.isFinite(expires.getTime()) || expires <= new Date())) ||
      !Array.isArray(recipientIds) ||
      recipientIds.length > 500 ||
      recipientIds.some((id) => !mongoose.isValidObjectId(id)) ||
      new Set(recipientIds).size !== recipientIds.length
    ) {
      res.status(400).json({ message: "Provide an announcement subject, message, and a future expiry date if applicable." });
      return;
    }
    const recipientSummary = await getApprovedActiveStudentRecipients();
    const activeRecipients = recipientSummary.recipients;
    const recipientIdsSet = new Set(recipientIds.map((id) => id.toString()));
    const allRecipients = recipientIds.length === 0;
    const intendedRecipients = recipientIds.length
      ? activeRecipients.filter((student) => recipientIdsSet.has(student._id.toString()))
      : activeRecipients;
    if (recipientIds.length && intendedRecipients.length !== recipientIds.length) {
      res.status(400).json({ message: "Choose one or more approved, active student recipients." });
      return;
    }

    const announcement = await Notification.create({
      subject: subject.trim(),
      message: message.trim(),
      kind: "announcement",
      published: true,
      audience: "selected",
      recipientIds: intendedRecipients.map((student) => student._id),
      category: "announcement",
      expiresAt: expires,
      sentBy: req.user._id,
      recipientCount: intendedRecipients.length,
      totalApprovedStudents: recipientSummary.totalApprovedStudents,
      registeredEmailAddresses: intendedRecipients.filter(student =>
        recipientSummary.emailRecipients.some(emailRecipient => emailRecipient._id.toString() === student._id.toString())
      ).length,
      skippedCount: allRecipients
        ? recipientSummary.skippedCount
        : Math.max(0, intendedRecipients.length -
          intendedRecipients.filter(student =>
            recipientSummary.emailRecipients.some(emailRecipient => emailRecipient._id.toString() === student._id.toString())
          ).length),
      inAppCount: intendedRecipients.length,
      inAppStatus: "created",
      deliveryStatus: "processing",
    });

    const intendedIds = new Set(intendedRecipients.map(student => student._id.toString()));
    const emailRecipients = recipientSummary.emailRecipients
      .filter(student => intendedIds.has(student._id.toString()));
    let delivery;
    try {
      delivery = await sendAnnouncementToRecipients(
        emailRecipients,
        subject.trim(),
        message.trim()
      );
    } catch (error) {
      const code = safeErrorCode(error);
      delivery = {
        recipientCount: emailRecipients.length,
        sentCount: 0,
        failedCount: emailRecipients.length,
        deliveryStatus: emailRecipients.length ? "failed" : "not-sent",
        emailResults: emailRecipients.map(student => ({
          email: student.email,
          status: "failed",
          errorCode: code,
          errorReason: getSmtpFailureMessage(code),
          attemptedAt: new Date(),
        })),
      };
    }

    announcement.sentCount = delivery.sentCount;
    announcement.failedCount = delivery.failedCount;
    announcement.deliveryStatus = delivery.deliveryStatus;
    announcement.emailResults = delivery.emailResults.map(result => ({
      ...result,
      attempts: [{
        status: result.status,
        attemptedAt: result.attemptedAt || null,
        acceptedAt: result.acceptedAt || null,
        errorCode: result.errorCode || "",
        errorReason: result.errorReason || "",
      }],
    }));
    await announcement.save();

    res.status(201).json({
      message: "Announcement published successfully.",
      announcement,
      deliverySummary: {
        totalIntendedRecipients: intendedRecipients.length,
        totalApprovedStudents: recipientSummary.totalApprovedStudents,
        inAppNotificationsCreated: announcement.inAppCount,
        inAppStatus: announcement.inAppStatus,
        emailsAccepted: announcement.sentCount,
        emailsFailed: announcement.failedCount,
        recipientsSkipped: announcement.skippedCount,
        emailStatus: announcement.deliveryStatus,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function retryFailedAnnouncementEmails(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ message: "Provide a valid announcement identifier." });
      return;
    }
    const announcement = await Notification.findOne({
      _id: req.params.id,
      kind: "announcement",
    });
    if (!announcement) {
      res.status(404).json({ message: "Announcement was not found." });
      return;
    }

    const failed = (announcement.emailResults || []).filter(item => item.status === "failed");
    if (!failed.length) {
      res.status(400).json({ message: "This announcement has no failed email recipients to retry." });
      return;
    }

    const recipientSummary = await getApprovedActiveStudentRecipients();
    const currentByEmail = new Map(
      recipientSummary.emailRecipients.map(student => [student.email.toLowerCase(), student])
    );
    const retryable = [];
    const skipped = [];
    for (const previous of failed) {
      const email = String(previous.email || "").toLowerCase();
      const current = currentByEmail.get(email);
      if (current && announcement.recipientIds.some(id => id.toString() === current._id.toString())) {
        retryable.push(current);
      } else {
        skipped.push({
          email,
          status: "skipped",
          errorCode: "RECIPIENT_NOT_ELIGIBLE",
          errorReason: "Recipient is no longer an approved, active registered student.",
          attemptedAt: new Date(),
        });
      }
    }

    let delivery = {
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      deliveryStatus: "not-sent",
      emailResults: [],
    };
    if (retryable.length) {
      try {
        delivery = await sendAnnouncementToRecipients(
          retryable,
          announcement.subject,
          announcement.message
        );
      } catch (error) {
        const code = safeErrorCode(error);
        delivery = {
          recipientCount: retryable.length,
          sentCount: 0,
          failedCount: retryable.length,
          deliveryStatus: "failed",
          emailResults: retryable.map(student => ({
            email: student.email,
            status: "failed",
            errorCode: code,
            errorReason: getSmtpFailureMessage(code),
            attemptedAt: new Date(),
          })),
        };
      }
    }

    const nextResults = (announcement.emailResults || []).filter(item => item.status !== "failed");
    for (const result of [...delivery.emailResults, ...skipped]) {
      const prior = (announcement.emailResults || []).find(
        item => item.email.toLowerCase() === result.email.toLowerCase()
      );
      nextResults.push({
        ...result,
        attempts: [
          ...(prior?.attempts || []),
          {
            status: result.status,
            attemptedAt: result.attemptedAt || null,
            acceptedAt: result.acceptedAt || null,
            errorCode: result.errorCode || "",
            errorReason: result.errorReason || "",
          },
        ],
      });
    }
    announcement.emailResults = nextResults;
    announcement.sentCount = nextResults.filter(item => item.status === "accepted").length;
    announcement.failedCount = nextResults.filter(item => item.status === "failed").length;
    announcement.skippedCount += skipped.length;
    announcement.deliveryStatus =
      announcement.sentCount === 0
        ? announcement.failedCount > 0 ? "failed" : "not-sent"
        : announcement.failedCount === 0 ? "sent" : "partial";
    await announcement.save();

    res.json({
      message: "Failed email retry completed.",
      announcement,
      deliverySummary: {
        totalIntendedRecipients: announcement.recipientCount,
        inAppNotificationsCreated: announcement.inAppCount,
        inAppStatus: announcement.inAppStatus,
        emailsAccepted: announcement.sentCount,
        emailsFailed: announcement.failedCount,
        recipientsSkipped: announcement.skippedCount,
        emailStatus: announcement.deliveryStatus,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateAnnouncement(req, res, next) {
  try {
    const { subject, message, published, expiresAt = null } = req.body || {};
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ message: "Provide a valid announcement identifier." });
      return;
    }
    const expires = expiresAt === null || expiresAt === "" ? null : new Date(expiresAt);
    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      subject.trim().length > 160 ||
      typeof message !== "string" ||
      !message.trim() ||
      message.trim().length > 10000 ||
      typeof published !== "boolean" ||
      (expiresAt && !Number.isFinite(expires.getTime()))
    ) {
      res.status(400).json({ message: "Provide a valid announcement subject, message, expiry, and publish status." });
      return;
    }
    const announcement = await Notification.findOneAndUpdate(
      { _id: req.params.id, kind: "announcement" },
      {
        $set: {
          subject: subject.trim(),
          message: message.trim(),
          published,
          expiresAt: expires,
        },
      },
      { new: true, runValidators: true }
    );
    if (!announcement) {
      res.status(404).json({ message: "Announcement was not found." });
      return;
    }
    res.json({ announcement });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createAnnouncement,
  createMenu,
  createSpecialMenu,
  deleteSpecialMenu,
  getAdminNotifications,
  getFoodPreparation,
  getFoodQuantity,
  getMeals,
  getMenu,
  getStatistics,
  getUsers,
  retryFailedAnnouncementEmails,
  saveFoodPreparation,
  setSpecialMenuPublished,
  updateMenu,
  updateSpecialMenu,
  updateAnnouncement,
  updateUserStatus,
};
