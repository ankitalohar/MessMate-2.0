const Attendance = require("../models/DiningAttendance");
const Feedback = require("../models/Feedback");
const FoodPreparation = require("../models/FoodPreparation");
const InventoryItem = require("../models/InventoryItem");
const Meal = require("../models/Meal");
const User = require("../models/User");
const { getDateKey, isValidDateKey } = require("../utils/date");

const MEALS = ["breakfast", "lunch", "teaTime", "dinner"];
const EXPORT_TYPES = new Set([
  "meal-preferences",
  "food-preparation",
  "inventory",
  "feedback",
  "attendance",
]);

function parsePeriod(query) {
  const { date, from, to } = query;
  if (
    (date && (from || to)) ||
    (date && !isValidDateKey(date)) ||
    (!date && (Boolean(from) !== Boolean(to))) ||
    (!date && from && (!isValidDateKey(from) || !isValidDateKey(to) || from > to)) ||
    (!date && from && (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 365)
  ) return null;
  const start = date || from || getDateKey();
  const end = date || to || start;
  return { start, end, range: { $gte: start, $lte: end } };
}

function cleanCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(cleanCell).join(",")).join("\r\n");
}

async function getAnalytics(req, res, next) {
  try {
    const period = parsePeriod(req.query);
    if (!period) {
      res.status(400).json({ message: "Provide a valid date or date range of at most 366 days." });
      return;
    }
    const students = await User.find({ role: "student", isActive: true }).select("_id").lean();
    const studentIds = students.map((student) => student._id);
    const [mealRecords, preparations, reviews, inventoryItems, attendances] = await Promise.all([
      Meal.find({ date: period.range, studentId: { $in: studentIds } }).lean(),
      FoodPreparation.find({ date: period.range }).lean(),
      Feedback.find({ date: period.range }).lean(),
      InventoryItem.find().select("transactions").lean(),
      Attendance.find({ date: period.range }).lean(),
    ]);

    const recordsByDate = new Map();
    for (const record of mealRecords) {
      const group = recordsByDate.get(record.date) || [];
      group.push(record);
      recordsByDate.set(record.date, group);
    }
    const dailyDemand = [];
    for (
      let cursor = new Date(`${period.start}T00:00:00.000Z`);
      cursor <= new Date(`${period.end}T00:00:00.000Z`);
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const date = cursor.toISOString().slice(0, 10);
      const records = recordsByDate.get(date) || [];
      let eat = 0;
      let skip = 0;
      let veg = 0;
      let nonVeg = 0;
      for (const record of records) {
        for (const meal of MEALS) {
          const choice = record[meal];
          if (choice?.status === "eat") {
            eat += 1;
            if (choice.mealType === "veg") veg += 1;
            if (choice.mealType === "nonVeg") nonVeg += 1;
          } else if (choice?.status === "skip") {
            skip += 1;
          }
        }
      }
      dailyDemand.push({
        date,
        eat,
        skip,
        notSelected: Math.max(0, students.length * MEALS.length - eat - skip),
        veg,
        nonVeg,
      });
    }

    const wasteByUnit = new Map();
    for (const item of preparations) {
      const total = wasteByUnit.get(item.unit) || { unit: item.unit, prepared: 0, served: 0, discarded: 0 };
      total.prepared += item.quantityPrepared;
      total.served += item.quantityServed;
      total.discarded += item.quantityDiscarded || 0;
      wasteByUnit.set(item.unit, total);
    }
    const inventoryUsage = new Map();
    for (const item of inventoryItems) {
      for (const transaction of item.transactions || []) {
        const transactionDate = transaction.createdAt?.toISOString?.().slice(0, 10);
        if (transaction.type !== "used" || !transactionDate || transactionDate < period.start || transactionDate > period.end) continue;
        inventoryUsage.set(transaction.unit, (inventoryUsage.get(transaction.unit) || 0) + transaction.quantity);
      }
    }
    const expectedByDateMeal = new Map();
    for (const record of mealRecords) {
      for (const meal of MEALS) {
        if (record[meal]?.status === "eat") {
          const key = `${record.date}|${meal}`;
          expectedByDateMeal.set(key, (expectedByDateMeal.get(key) || 0) + 1);
        }
      }
    }
    const attendanceSummary = attendances.map((item) => {
      const expected = expectedByDateMeal.get(`${item.date}|${item.meal}`) || 0;
      return { date: item.date, meal: item.meal, expected, actual: item.attendanceCount, difference: item.attendanceCount - expected };
    });
    const averageRating = reviews.length
      ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length
      : null;
    const mealRatings = Object.fromEntries(MEALS.map((meal) => {
      const values = reviews.filter((item) => item.meal === meal);
      return [meal, {
        averageRating: values.length ? values.reduce((sum, item) => sum + item.rating, 0) / values.length : null,
        reviewCount: values.length,
      }];
    }));
    res.json({
      period: { from: period.start, to: period.end },
      eligibleStudents: students.length,
      mealDemand: {
        eat: dailyDemand.reduce((sum, item) => sum + item.eat, 0),
        skip: dailyDemand.reduce((sum, item) => sum + item.skip, 0),
        notSelected: dailyDemand.reduce((sum, item) => sum + item.notSelected, 0),
        veg: dailyDemand.reduce((sum, item) => sum + item.veg, 0),
        nonVeg: dailyDemand.reduce((sum, item) => sum + item.nonVeg, 0),
        daily: dailyDemand,
      },
      foodWaste: [...wasteByUnit.values()],
      ratings: { average: averageRating, count: reviews.length, byMeal: mealRatings },
      inventoryUsage: [...inventoryUsage].map(([unit, quantity]) => ({ unit, quantity })),
      attendance: attendanceSummary,
    });
  } catch (error) {
    next(error);
  }
}

async function exportReport(req, res, next) {
  try {
    const type = req.query.type;
    const period = parsePeriod(req.query);
    if (!EXPORT_TYPES.has(type) || !period) {
      res.status(400).json({ message: "Choose a supported report and valid date or date range of at most 366 days." });
      return;
    }
    let headers;
    let rows;
    if (type === "meal-preferences") {
      headers = ["Date", "Student", "Email", "Breakfast", "Lunch", "Tea Time", "Dinner"];
      const users = await User.find({ role: "student" }).select("_id name email").lean();
      const userById = new Map(users.map((user) => [user._id.toString(), user]));
      const records = await Meal.find({ date: period.range, studentId: { $in: users.map((user) => user._id) } }).lean();
      rows = records.map((record) => {
        const user = userById.get(record.studentId.toString());
        return [
          record.date,
          user?.name || "",
          user?.email || "",
          ...MEALS.map((meal) => {
            const choice = record[meal];
            return choice?.status === "eat"
              ? `EAT / ${choice.mealType || "type not selected"}`
              : choice?.status || "not-selected";
          }),
        ];
      });
    } else if (type === "food-preparation") {
      headers = ["Date", "Meal", "Food item", "Prepared", "Served", "Discarded", "Unit", "Reason", "Notes"];
      const records = await FoodPreparation.find({ date: period.range }).sort({ date: 1, meal: 1 }).lean();
      rows = records.map((item) => [item.date, item.meal, item.foodItem, item.quantityPrepared, item.quantityServed, item.quantityDiscarded, item.unit, item.reason, item.notes]);
    } else if (type === "inventory") {
      headers = ["Item", "Current quantity", "Unit", "Low stock threshold", "Supplier", "Purchase date", "Expiry date", "Transaction date", "Transaction type", "Transaction quantity", "Transaction unit", "Note"];
      const items = await InventoryItem.find().sort({ name: 1 }).lean();
      rows = items.flatMap((item) => {
        const transactions = (item.transactions || []).filter((transaction) => {
          const transactionDate = transaction.createdAt?.toISOString?.().slice(0, 10);
          return transactionDate && transactionDate >= period.start && transactionDate <= period.end;
        });
        return transactions.length
          ? transactions.map((transaction) => [item.name, item.currentQuantity, item.unit, item.lowStockThreshold, item.supplier, item.purchaseDate, item.expiryDate, transaction.createdAt, transaction.type, transaction.quantity, transaction.unit, transaction.note])
          : [[item.name, item.currentQuantity, item.unit, item.lowStockThreshold, item.supplier, item.purchaseDate, item.expiryDate, "", "", "", "", ""]];
      });
    } else if (type === "feedback") {
      headers = ["Date", "Meal", "Rating", "Feedback", "Submitted", "Reviewed"];
      const records = await Feedback.find({ date: period.range }).sort({ date: 1 }).lean();
      rows = records.map((item) => [item.date, item.meal, item.rating, item.feedback, item.createdAt, item.reviewed ? "yes" : "no"]);
    } else if (type === "attendance") {
      headers = ["Date", "Meal", "Actual attendance"];
      const records = await Attendance.find({ date: period.range }).sort({ date: 1, meal: 1 }).lean();
      rows = records.map((item) => [item.date, item.meal, item.attendanceCount]);
    }
    if (rows.length > 10000) {
      res.status(413).json({ message: "The report is too large. Narrow the selected date range." });
      return;
    }
    const csv = toCsv(headers, rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="messmate-${type}-${period.start}-to-${period.end}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
}

module.exports = { cleanCell, exportReport, getAnalytics, parsePeriod, toCsv };
