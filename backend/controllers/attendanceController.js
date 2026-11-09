const DiningAttendance = require("../models/DiningAttendance");
const Meal = require("../models/Meal");
const User = require("../models/User");
const { getDateKey, isValidDateKey } = require("../utils/date");

const MEALS = ["breakfast", "lunch", "teaTime", "dinner"];

function validRange(from, to) {
  return isValidDateKey(from) &&
    isValidDateKey(to) &&
    from <= to &&
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 <= 365;
}

async function attendanceStats(records) {
  const dates = [...new Set(records.map((record) => record.date))];
  const students = await User.find({ role: "student", isActive: true }).select("_id").lean();
  const ids = students.map((student) => student._id);
  const preferences = ids.length && dates.length
    ? await Meal.find({ date: { $in: dates }, studentId: { $in: ids } }).lean()
    : [];
  const expectedByDateMeal = new Map();
  for (const preference of preferences) {
    for (const meal of MEALS) {
      if (preference[meal]?.status === "eat") {
        const key = `${preference.date}|${meal}`;
        expectedByDateMeal.set(key, (expectedByDateMeal.get(key) || 0) + 1);
      }
    }
  }
  return records.map((record) => {
    const expected = expectedByDateMeal.get(`${record.date}|${record.meal}`) || 0;
    return {
      ...record,
      expectedEatCount: expected,
      difference: record.attendanceCount - expected,
    };
  });
}

async function getAttendance(req, res, next) {
  try {
    const { date, from, to, meal } = req.query;
    if (
      (date && (from || to)) ||
      (date && !isValidDateKey(date)) ||
      (!date && (Boolean(from) !== Boolean(to))) ||
      (!date && from && !validRange(from, to)) ||
      (meal && !MEALS.includes(meal))
    ) {
      res.status(400).json({ message: "Provide a valid date or date range up to 366 days and an optional meal." });
      return;
    }
    const filter = date
      ? { date }
      : from
        ? { date: { $gte: from, $lte: to } }
        : { date: getDateKey() };
    if (meal) filter.meal = meal;
    const records = await DiningAttendance.find(filter).sort({ date: -1, meal: 1 }).lean();
    res.json({ attendance: await attendanceStats(records) });
  } catch (error) {
    next(error);
  }
}

async function saveAttendance(req, res, next) {
  try {
    const { date, meal, attendanceCount } = req.body || {};
    if (
      !isValidDateKey(date) ||
      !MEALS.includes(meal) ||
      !Number.isInteger(attendanceCount) ||
      attendanceCount < 0 ||
      attendanceCount > 1000000
    ) {
      res.status(400).json({ message: "Provide a valid meal date, meal, and non-negative whole-person attendance count." });
      return;
    }
    const eligibleStudents = await User.countDocuments({ role: "student", isActive: true });
    if (attendanceCount > eligibleStudents) {
      res.status(400).json({ message: "Attendance cannot exceed the number of active student accounts." });
      return;
    }
    const filter = { date, meal };
    const update = {
      $set: { attendanceCount, recordedBy: req.user._id },
      $setOnInsert: filter,
    };
    let record;
    try {
      record = await DiningAttendance.findOneAndUpdate(filter, update, {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      record = await DiningAttendance.findOneAndUpdate(filter, { $set: update.$set }, { new: true, runValidators: true });
    }
    const [withStats] = await attendanceStats([record.toObject()]);
    res.json({ attendance: withStats });
  } catch (error) {
    next(error);
  }
}

module.exports = { getAttendance, saveAttendance };
