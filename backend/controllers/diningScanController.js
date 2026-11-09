const crypto = require("crypto");
const DiningQrToken = require("../models/DiningQrToken");
const StudentDiningAttendance = require("../models/StudentDiningAttendance");
const Menu = require("../models/Menu");
const User = require("../models/User");
const StudentAuthorization = require("../models/StudentAuthorization");
const { getDateKey, isValidDateKey, TIME_ZONE } = require("../utils/date");
const {
  findAuthorizationForAccount,
  normalizeStudentId,
  normalizeStudentName,
} = require("../utils/studentIdentity");

const TOKEN_TTL_MS = 90 * 1000;
const MEALS = ["breakfast", "lunch", "teaTime", "dinner"];

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getLocalMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function mealWindow(meal, isHoliday = false) {
  if (meal === "breakfast") return isHoliday ? [480, 570] : [390, 510];
  if (meal === "lunch") return [750, 870];
  if (meal === "teaTime") return [1080, 1140];
  if (meal === "dinner") return [1200, 1305];
  return null;
}

async function validateStudent(student) {
  if (!student || student.role !== "student" || !student.isActive) return false;
  const authorization = await findAuthorizationForAccount(StudentAuthorization, student);
  return Boolean(
    authorization &&
    String(authorization.status).toUpperCase() === "APPROVED" &&
    normalizeStudentName(authorization.fullName) === normalizeStudentName(student.name) &&
    (!authorization.email || authorization.email === student.email)
  );
}

async function ensureMealWindow(meal, now) {
  if (!MEALS.includes(meal)) return { open: false, date: getDateKey(now) };
  const date = getDateKey(now);
  const menu = await Menu.findOne({ date }).select("isHoliday").lean();
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const isHoliday = Boolean(menu?.isHoliday) || weekday === 0;
  const [opensAt, closesAt] = mealWindow(meal, meal === "breakfast" && isHoliday);
  const minutes = getLocalMinutes(now);
  return { open: minutes >= opensAt && minutes < closesAt, date };
}

async function getDiningQr(req, res, next) {
  try {
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await DiningQrToken.findOneAndUpdate(
      { studentId: req.user._id },
      { $set: { tokenHash: tokenHash(token), expiresAt } },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ token, expiresAt, timeZone: TIME_ZONE });
  } catch (error) {
    next(error);
  }
}

async function getStudentAttendanceHistory(req, res, next) {
  try {
    const attendance = await StudentDiningAttendance.find({ studentId: req.user._id })
      .sort({ date: -1, scannedAt: -1 })
      .limit(180)
      .lean();
    res.json({ attendance });
  } catch (error) {
    next(error);
  }
}

async function recordAttendance(student, meal, adminId, res) {
  const now = new Date();
  const schedule = await ensureMealWindow(meal, now);
  if (!schedule.open) {
    res.status(403).json({ message: "Check-in is available only during the selected meal's scheduled time in Asia/Kolkata." });
    return;
  }
  try {
    const attendance = await StudentDiningAttendance.create({
      studentId: student._id,
      date: schedule.date,
      meal,
      scannedAt: now,
      status: "present",
      recordedBy: adminId,
    });
    res.status(201).json({
      attendance: {
        id: attendance._id,
        date: attendance.date,
        meal: attendance.meal,
        scannedAt: attendance.scannedAt,
        status: attendance.status,
      },
      student: { id: student._id, name: student.name, rollNumber: student.rollNumber },
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ message: "Attendance has already been recorded for this student and meal today." });
      return;
    }
    throw error;
  }
}

async function scanDiningQr(req, res, next) {
  try {
    const { token, meal } = req.body || {};
    if (typeof token !== "string" || token.length < 32 || token.length > 128 || !MEALS.includes(meal)) {
      res.status(400).json({ message: "Provide a valid dining QR token and meal." });
      return;
    }
    const storedToken = await DiningQrToken.findOne({
      tokenHash: tokenHash(token),
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!storedToken) {
      res.status(401).json({ message: "This dining QR is invalid, expired, or has been rotated." });
      return;
    }
    const student = await User.findById(storedToken.studentId).select(
      "_id name email role isActive rollNumber universityRegistrationNumber"
    );
    if (!(await validateStudent(student))) {
      res.status(403).json({ message: "This student is not currently approved and active." });
      return;
    }
    await recordAttendance(student, meal, req.user._id, res);
  } catch (error) {
    next(error);
  }
}

async function recordManualAttendance(req, res, next) {
  try {
    const rollNumber = normalizeStudentId(req.body?.rollNumber);
    const { meal } = req.body || {};
    if (!rollNumber || rollNumber.length > 30 || !MEALS.includes(meal)) {
      res.status(400).json({ message: "Provide a valid student roll number and meal." });
      return;
    }
    const student = await User.findOne({ role: "student", isActive: true, rollNumber }).select(
      "_id name email role isActive rollNumber universityRegistrationNumber"
    );
    if (!(await validateStudent(student))) {
      res.status(404).json({ message: "No approved, active student matches that roll number." });
      return;
    }
    await recordAttendance(student, meal, req.user._id, res);
  } catch (error) {
    next(error);
  }
}

async function getStudentAttendance(req, res, next) {
  try {
    const { date, meal } = req.query;
    if (!isValidDateKey(date) || !MEALS.includes(meal)) {
      res.status(400).json({ message: "Provide a valid meal date and meal." });
      return;
    }
    const attendance = await StudentDiningAttendance.find({ date, meal })
      .populate("studentId", "name rollNumber")
      .sort({ scannedAt: -1 })
      .lean();
    res.json({ attendance });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDiningQr,
  getStudentAttendance,
  getStudentAttendanceHistory,
  recordManualAttendance,
  scanDiningQr,
};