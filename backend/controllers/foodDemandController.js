const DiningAttendance = require("../models/DiningAttendance");
const FoodDemandPrediction = require("../models/FoodDemandPrediction");
const FoodPreparation = require("../models/FoodPreparation");
const Meal = require("../models/Meal");
const StudentAuthorization = require("../models/StudentAuthorization");
const StudentDiningAttendance = require("../models/StudentDiningAttendance");
const User = require("../models/User");
const { addDays, isValidDateKey } = require("../utils/date");
const {
  normalizeStudentId,
  normalizeStudentName,
} = require("../utils/studentIdentity");

const MEALS = ["breakfast", "lunch", "teaTime", "dinner"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dateWeekday(date) {
  return WEEKDAYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
}

function approvedStudents(users, authorizations) {
  const authorizationByIdentity = new Map();
  const authorizationByEmail = new Map();
  for (const authorization of authorizations) {
    const identity = `${normalizeStudentId(authorization.rollNumber)}|${normalizeStudentId(authorization.universityRegistrationNumber)}`;
    authorizationByIdentity.set(identity, authorization);
    if (authorization.email) authorizationByEmail.set(authorization.email.trim().toLowerCase(), authorization);
  }
  return users.filter((user) => {
    const roll = normalizeStudentId(user.rollNumber);
    const registration = normalizeStudentId(user.universityRegistrationNumber);
    const authorization = roll && registration
      ? authorizationByIdentity.get(`${roll}|${registration}`)
      : authorizationByEmail.get(String(user.email || "").trim().toLowerCase());
    return Boolean(
      authorization &&
      normalizeStudentName(authorization.fullName) === normalizeStudentName(user.name) &&
      (!user.email || !authorization.email || authorization.email.trim().toLowerCase() === user.email.trim().toLowerCase()) &&
      (!roll || normalizeStudentId(authorization.rollNumber) === roll) &&
      (!registration || normalizeStudentId(authorization.universityRegistrationNumber) === registration)
    );
  });
}

function combineActuals(studentRecords, aggregateRecords) {
  const studentCounts = new Map();
  const scannedStudentsByDateMeal = new Map();
  const aggregateCounts = new Map();
  for (const record of studentRecords) {
    const key = `${record.date}|${record.meal}`;
    const scannedStudents = scannedStudentsByDateMeal.get(key) || new Set();
    scannedStudents.add(String(record.studentId));
    scannedStudentsByDateMeal.set(key, scannedStudents);
    studentCounts.set(key, scannedStudents.size);
  }
  for (const record of aggregateRecords) {
    aggregateCounts.set(`${record.date}|${record.meal}`, record.attendanceCount);
  }
  const actualByDateMeal = new Map(aggregateCounts);
  for (const [key, count] of studentCounts) actualByDateMeal.set(key, count);
  return { actualByDateMeal, scannedStudentsByDateMeal };
}

async function buildPrediction(date, meal, studentIds) {
  const historyStart = addDays(date, -365);
  const [targetPreferences, historicalPreferences, studentRecords, aggregateRecords, preparationRecords] = await Promise.all([
    Meal.find({ date, studentId: { $in: studentIds } }).lean(),
    Meal.find({ date: { $gte: historyStart, $lt: date }, studentId: { $in: studentIds } }).lean(),
    StudentDiningAttendance.find({ date: { $gte: historyStart, $lt: date }, meal }).select("date meal studentId").lean(),
    DiningAttendance.find({ date: { $gte: historyStart, $lt: date }, meal }).select("date meal attendanceCount").lean(),
    FoodPreparation.find({ date: { $gte: historyStart, $lt: date }, meal }).select("date unit quantityServed").lean(),
  ]);
  const eatStudents = new Set(
    targetPreferences
      .filter((record) => record[meal]?.status === "eat")
      .map((record) => String(record.studentId))
  );
  const { actualByDateMeal, scannedStudentsByDateMeal } = combineActuals(studentRecords, aggregateRecords);
  const eatByDate = new Map();
  for (const preference of historicalPreferences) {
    if (preference[meal]?.status !== "eat") continue;
    const eatStudentsForDate = eatByDate.get(preference.date) || new Set();
    eatStudentsForDate.add(String(preference.studentId));
    eatByDate.set(preference.date, eatStudentsForDate);
  }
  const history = [];
  for (const [historyDate, eatStudents] of eatByDate) {
    const key = `${historyDate}|${meal}`;
    const scannedStudents = scannedStudentsByDateMeal.get(key);
    if (scannedStudents?.size) {
      const attendedEatCount = [...eatStudents].filter((studentId) => scannedStudents.has(studentId)).length;
      history.push({
        date: historyDate,
        eatCount: eatStudents.size,
        actualAttendance: actualByDateMeal.get(key),
        attendedEatCount,
        individual: true,
      });
      continue;
    }
    const aggregateAttendance = aggregateRecords.find((record) => record.date === historyDate)?.attendanceCount;
    if (aggregateAttendance === undefined) continue;
    history.push({
      date: historyDate,
      eatCount: eatStudents.size,
      actualAttendance: aggregateAttendance,
      attendedEatCount: Math.min(eatStudents.size, aggregateAttendance),
      individual: false,
    });
  }
  const sameWeekdayHistory = history.filter((record) => dateWeekday(record.date) === dateWeekday(date));
  const rateHistory = sameWeekdayHistory.length ? sameWeekdayHistory : history;
  const historicalEatCount = rateHistory.reduce((total, record) => total + record.eatCount, 0);
  const historicalActualCount = rateHistory.reduce((total, record) => total + record.attendedEatCount, 0);
  const historicalAttendanceRate = historicalEatCount
    ? Math.max(0, Math.min(1, historicalActualCount / historicalEatCount))
    : 1;
  const priorActuals = Array.from(actualByDateMeal.entries())
    .filter(([key]) => key.endsWith(`|${meal}`))
    .map(([key, count]) => ({ date: key.split("|")[0], count }))
    .sort((left, right) => right.date.localeCompare(left.date));
  const previousAttendance = priorActuals[0]?.count ?? null;
  const predictedAttendance = Math.round(eatStudents.size * historicalAttendanceRate);
  const gramsByDate = new Map();
  for (const record of preparationRecords) {
    const multiplier = record.unit === "kg" ? 1000 : record.unit === "g" ? 1 : 0;
    if (!multiplier) continue;
    gramsByDate.set(record.date, (gramsByDate.get(record.date) || 0) + record.quantityServed * multiplier);
  }
  let consumptionGrams = 0;
  let consumptionAttendance = 0;
  for (const [consumptionDate, grams] of gramsByDate) {
    const actual = actualByDateMeal.get(`${consumptionDate}|${meal}`);
    if (actual > 0) {
      consumptionGrams += grams;
      consumptionAttendance += actual;
    }
  }
  const averageConsumptionPerStudentGrams = consumptionAttendance
    ? consumptionGrams / consumptionAttendance
    : null;
  const rawRecommendationKg = averageConsumptionPerStudentGrams === null
    ? null
    : predictedAttendance * averageConsumptionPerStudentGrams / 1000;
  const recommendedQuantityKg = rawRecommendationKg === null
    ? null
    : Math.ceil(rawRecommendationKg * 2) / 2;
  const confidence = rateHistory.length >= 10
    ? "high"
    : rateHistory.length >= 3
      ? "medium"
      : rateHistory.length > 0
        ? "low"
        : "insufficient";
  const individualHistoryDays = rateHistory.filter((record) => record.individual).length;
  const aggregateHistoryDays = rateHistory.length - individualHistoryDays;

  return {
    date,
    meal,
    dayOfWeek: dateWeekday(date),
    eatCount: eatStudents.size,
    historicalAttendanceRate,
    previousAttendance,
    predictedAttendance,
    actualAttendance: null,
    averageConsumptionPerStudentGrams,
    recommendedQuantityKg,
    historicalAttendanceDays: rateHistory.length,
    confidence,
    dataAvailability: rateHistory.length
      ? `${rateHistory.length} prior actual day(s): ${individualHistoryDays} student-verified and ${aggregateHistoryDays} aggregate estimate(s). Consumption ${averageConsumptionPerStudentGrams === null ? "not measured" : "measured from served g/kg records"}.`
      : "No prior actual attendance; using all selected EAT preferences as the baseline. Consumption is unavailable until served quantities are recorded.",
    model: "baseline",
  };
}

async function getEligibleStudentIds() {
  const [users, authorizations] = await Promise.all([
    User.find({ role: "student", isActive: true })
      .select("_id name email rollNumber universityRegistrationNumber")
      .lean(),
    StudentAuthorization.find({ status: "APPROVED" })
      .select("rollNumber universityRegistrationNumber email fullName")
      .lean(),
  ]);
  return approvedStudents(users, authorizations).map((user) => user._id);
}

async function predictFoodDemand(req, res, next) {
  try {
    const date = req.query.date;
    if (!isValidDateKey(date)) {
      res.status(400).json({ message: "Provide a valid meal date (YYYY-MM-DD)." });
      return;
    }
    const studentIds = await getEligibleStudentIds();
    const meals = await Promise.all(MEALS.map(async (meal) => {
      const forecast = await buildPrediction(date, meal, studentIds);
      const actual = await StudentDiningAttendance.countDocuments({ date, meal });
      const legacy = actual === 0
        ? await DiningAttendance.findOne({ date, meal }).select("attendanceCount").lean()
        : null;
      const actualAttendance = actual > 0 ? actual : legacy?.attendanceCount ?? null;
      let snapshot;
      try {
        snapshot = await FoodDemandPrediction.findOneAndUpdate(
          { date, meal },
          { $setOnInsert: forecast },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
      } catch (error) {
        if (error.code !== 11000) throw error;
        snapshot = await FoodDemandPrediction.findOne({ date, meal });
      }
      if (actualAttendance !== null) {
        snapshot = await FoodDemandPrediction.findOneAndUpdate(
          { date, meal },
          { $set: { actualAttendance } },
          { new: true, runValidators: true }
        );
      }
      return snapshot.toObject ? snapshot.toObject() : snapshot;
    }));
    res.json({ date, model: "baseline", meals });
  } catch (error) {
    next(error);
  }
}

async function getFoodDemandHistory(req, res, next) {
  try {
    const { from, to, date, meal } = req.query;
    const valid = date
      ? isValidDateKey(date) && !from && !to
      : isValidDateKey(from) && isValidDateKey(to) && from <= to &&
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 <= 365;
    if (!valid || (meal && !MEALS.includes(meal))) {
      res.status(400).json({ message: "Provide a valid date or date range up to 366 days and an optional meal." });
      return;
    }
    const filter = date ? { date } : { date: { $gte: from, $lte: to } };
    if (meal) filter.meal = meal;
    const predictions = await FoodDemandPrediction.find(filter).sort({ date: 1, meal: 1 }).lean();
    res.json({ predictions });
  } catch (error) {
    next(error);
  }
}

module.exports = { buildPrediction, getFoodDemandHistory, predictFoodDemand };