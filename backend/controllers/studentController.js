const Meal = require("../models/Meal");
const Feedback = require("../models/Feedback");
const mongoose = require("mongoose");
const Menu = require("../models/Menu");
const Notification = require("../models/Notification");
const {
  CUTOFF_LABEL,
  TIME_ZONE,
  addDays,
  getDateKey,
  getNextSubmissionDate,
  getSubmissionDeadlineAt,
  getSubmissionDeadlineDate,
  isMealSubmissionOpen,
  isValidDateKey,
} = require("../utils/date");

const MEAL_NAMES = ["breakfast", "lunch", "teaTime", "dinner"];
const MEAL_STATUSES = ["eat", "skip", "not-selected"];
const MEAL_TYPES = ["veg", "nonVeg"];
const MEAL_TIMINGS = {
  breakfast: { regular: "6:30 AM – 8:30 AM", holiday: "8:00 AM – 9:30 AM" },
  lunch: "12:30 PM – 2:30 PM",
  teaTime: "6:00 PM – 7:00 PM",
  dinner: "8:00 PM – 9:45 PM",
};

function requestedDate(value) {
  const date = value || getNextSubmissionDate();
  return isValidDateKey(date) ? date : null;
}

function closedSubmissionMessage(date, now = new Date()) {
  const nextSubmissionDate = getNextSubmissionDate(now);
  if (date < nextSubmissionDate) {
    return `The deadline for ${date} has passed. You can submit preferences for ${nextSubmissionDate} until ${CUTOFF_LABEL} IST on ${getSubmissionDeadlineDate(nextSubmissionDate)}.`;
  }
  return `You can submit preferences only for the next available date, ${nextSubmissionDate}.`;
}

function mealMenuForPreferences(menu, mealName) {
  const special = menu?.specialMenus?.find((item) =>
    item.isPublished && item.date === menu.date && item[mealName]
  );
  return special ? special[mealName] : menu?.[mealName];
}

async function getProfile(req, res) {
  const { _id, name, email, mobile, role, hostel, room } = req.user;
  res.json({ user: { id: _id, name, email, mobile, role, hostel, room } });
}

async function getMenu(req, res, next) {
  try {
    const date = requestedDate(req.query.date);
    if (!date) {
      res.status(400).json({ message: "Please provide a valid menu date (YYYY-MM-DD)." });
      return;
    }
    const storedMenu = await Menu.findOne({ date }).lean();
    const menu = storedMenu
      ? {
          ...storedMenu,
          specialMenus: (storedMenu.specialMenus || [])
            .filter((special) => special.isPublished && special.date === date)
            .map(({ _id, occasionName, date: specialDate, breakfast, lunch, teaTime, dinner, description, createdAt, updatedAt }) => ({
              _id,
              occasionName,
              date: specialDate,
              breakfast,
              lunch,
              teaTime,
              dinner,
              description,
              createdAt,
              updatedAt,
            })),
        }
      : null;
    const sunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
    const now = new Date();
    const nextSubmissionDate = getNextSubmissionDate(now);
    const selectionOpen = date === nextSubmissionDate;
    const selectionDeadlineAt = getSubmissionDeadlineAt(date);
    res.json({
      date,
      tomorrowDate: addDays(getDateKey(now), 1),
      menu,
      mealTimings: {
        ...MEAL_TIMINGS,
        breakfast: sunday || menu?.isHoliday
          ? MEAL_TIMINGS.breakfast.holiday
          : MEAL_TIMINGS.breakfast.regular,
      },
      selectionOpen,
      selectionMessage: selectionOpen ? "" : closedSubmissionMessage(date, now),
      nextSubmissionDate,
      nextAfterCutoffDate: addDays(date, 1),
      selectionWindowMs: selectionOpen
        ? Math.max(0, selectionDeadlineAt.getTime() - now.getTime())
        : 0,
      selectionCutoff: CUTOFF_LABEL,
      cutoffDate: getSubmissionDeadlineDate(date),
      timeZone: TIME_ZONE,
    });
  } catch (err) {
    next(err);
  }
}

async function getMealPreferences(req, res, next) {
  try {
    const date = requestedDate(req.query.date);
    if (!date) {
      res.status(400).json({ message: "Please provide a valid meal date (YYYY-MM-DD)." });
      return;
    }
    const meal = await Meal.findOne({ studentId: req.user._id, date }).lean();
    res.json({ date, meal });
  } catch (err) {
    next(err);
  }
}

async function saveMealPreference(req, res, next) {
  try {
    const { date, meal: mealName, status, mealType } = req.body || {};
    const mealDate = requestedDate(date);
    if (!mealDate) {
      res.status(400).json({ message: "Please provide a valid meal date (YYYY-MM-DD)." });
      return;
    }
    const now = new Date();
    if (!isMealSubmissionOpen(mealDate, now)) {
      res.status(403).json({ message: closedSubmissionMessage(mealDate, now) });
      return;
    }
    if (
      !MEAL_NAMES.includes(mealName) ||
      !["eat", "skip"].includes(status)
    ) {
      res.status(400).json({ message: "Choose a valid meal and select eat or skip." });
      return;
    }
    if (status === "eat" && !MEAL_TYPES.includes(mealType)) {
      res.status(400).json({ message: "Choose a vegetarian or non-vegetarian meal." });
      return;
    }
    if (status === "eat") {
      const menu = await Menu.findOne({ date: mealDate }).select(`${mealName} specialMenus date`).lean();
      const availableOptions = mealMenuForPreferences(menu, mealName)?.[mealType];
      if (!Array.isArray(availableOptions) || availableOptions.length === 0) {
        res.status(400).json({
          message: `No ${mealType === "nonVeg" ? "non-vegetarian" : "vegetarian"} option is available for ${mealName}.`,
        });
        return;
      }
    }
    const filter = { studentId: req.user._id, date: mealDate };
    const update = {
      $set: {
        [`${mealName}.status`]: status,
        [`${mealName}.mealType`]: status === "eat" ? mealType : null,
      },
    };
    let meal;
    try {
      meal = await Meal.findOneAndUpdate(filter, update, {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      meal = await Meal.findOneAndUpdate(filter, update, {
        new: true,
        runValidators: true,
      });
    }
    res.json({ meal });
  } catch (err) {
    next(err);
  }
}

async function saveMealPreferences(req, res, next) {
  try {
    const { date, meals } = req.body || {};
    const mealDate = requestedDate(date);
    if (!mealDate) {
      res.status(400).json({ message: "Please provide a valid meal date (YYYY-MM-DD)." });
      return;
    }
    const now = new Date();
    if (!isMealSubmissionOpen(mealDate, now)) {
      res.status(403).json({ message: closedSubmissionMessage(mealDate, now) });
      return;
    }
    if (
      !meals ||
      typeof meals !== "object" ||
      Array.isArray(meals) ||
      Object.keys(meals).length !== MEAL_NAMES.length ||
      MEAL_NAMES.some((name) => !Object.hasOwn(meals, name))
    ) {
      res.status(400).json({
        message: "Provide a preference for breakfast, lunch, Tea Time, and dinner.",
      });
      return;
    }
    const menu = await Menu.findOne({ date: mealDate }).lean();
    const updateFields = {};
    for (const mealName of MEAL_NAMES) {
      const choice = meals[mealName];
      if (
        !choice ||
        typeof choice !== "object" ||
        Array.isArray(choice) ||
        !MEAL_STATUSES.includes(choice.status)
      ) {
        res.status(400).json({ message: `Choose a valid status for ${mealName}.` });
        return;
      }

      if (choice.status === "eat") {
        if (!MEAL_TYPES.includes(choice.mealType)) {
          res.status(400).json({
            message: `Choose a vegetarian or non-vegetarian option for ${mealName}.`,
          });
          return;
        }
        const availableOptions = mealMenuForPreferences(menu, mealName)?.[choice.mealType];
        if (!Array.isArray(availableOptions) || availableOptions.length === 0) {
          res.status(400).json({
            message: `No ${choice.mealType === "nonVeg" ? "non-vegetarian" : "vegetarian"} option is available for ${mealName}.`,
          });
          return;
        }
      } else if (choice.mealType !== null) {
        res.status(400).json({
          message: `Clear the food preference when ${mealName} is not selected for eating.`,
        });
        return;
      }

      updateFields[`${mealName}.status`] = choice.status;
      updateFields[`${mealName}.mealType`] =
        choice.status === "eat" ? choice.mealType : null;
    }

    const filter = { studentId: req.user._id, date: mealDate };
    const update = { $set: updateFields };
    let meal;
    try {
      meal = await Meal.findOneAndUpdate(filter, update, {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      meal = await Meal.findOneAndUpdate(filter, update, {
        new: true,
        runValidators: true,
      });
    }
    res.json({ meal });
  } catch (err) {
    next(err);
  }
}

async function getNotifications(req, res, next) {
  try {
    const notifications = await Notification.find({
      kind: "announcement",
      published: true,
      $and: [
        {
          $or: [
            { audience: "students" },
            { audience: "selected", recipientIds: req.user._id },
          ],
        },
        {
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        },
      ],
    })
      .select("subject message kind category createdAt expiresAt readBy")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    const result = notifications.map((notification) => ({
      ...notification,
      isRead: notification.readBy?.some((userId) => userId.toString() === req.user._id.toString()) || false,
      readBy: undefined,
    }));
    res.json({
      notifications: result,
      unreadCount: result.filter((notification) => !notification.isRead).length,
    });
  } catch (err) {
    next(err);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ message: "Provide a valid notification identifier." });
      return;
    }
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        kind: "announcement",
        published: true,
        $or: [
          { audience: "students" },
          { audience: "selected", recipientIds: req.user._id },
        ],
        $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }],
      },
      { $addToSet: { readBy: req.user._id } },
      { new: true }
    );
    if (!notification) {
      res.status(404).json({ message: "Notification was not found." });
      return;
    }
    res.json({ success: true, id: notification._id });
  } catch (err) {
    next(err);
  }
}

async function getDiningHistory(req, res, next) {
  try {
    const { from, to, meal } = req.query;
    if (
      (from && !isValidDateKey(from)) ||
      (to && !isValidDateKey(to)) ||
      (Boolean(from) !== Boolean(to)) ||
      (from && (from > to || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 365)) ||
      (meal && !MEAL_NAMES.includes(meal))
    ) {
      res.status(400).json({ message: "Provide a valid date range of at most 366 days and an optional meal." });
      return;
    }
    const filter = { studentId: req.user._id };
    if (from) filter.date = { $gte: from, $lte: to };
    const [records, feedback] = await Promise.all([
      Meal.find(filter).sort({ date: -1 }).lean(),
      Feedback.find({
        studentId: req.user._id,
        ...(from ? { date: { $gte: from, $lte: to } } : {}),
        ...(meal ? { meal } : {}),
      }).sort({ date: -1 }).lean(),
    ]);
    const meals = records.map((record) => {
      const choices = Object.fromEntries(
        MEAL_NAMES
          .filter((name) => !meal || name === meal)
          .map((name) => [name, record[name] || { status: "not-selected", mealType: null }])
      );
      return { date: record.date, choices };
    });
    const counts = { eat: 0, skip: 0, notSelected: 0 };
    for (const row of meals) {
      for (const choice of Object.values(row.choices)) {
        const key = choice.status === "eat" ? "eat" : choice.status === "skip" ? "skip" : "notSelected";
        counts[key] += 1;
      }
    }
    res.json({ meals, feedback, counts, attendanceAvailable: false, attendance: [] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDiningHistory,
  getMealPreferences,
  getMenu,
  getNotifications,
  getProfile,
  markNotificationRead,
  saveMealPreferences,
  saveMealPreference,
};
