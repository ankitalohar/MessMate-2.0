const mongoose = require("mongoose");
const Feedback = require("../models/Feedback");
const { isValidDateKey } = require("../utils/date");
const { sendFeedbackNotification } = require("./emailController");

const MEAL_NAMES = ["breakfast", "lunch", "teaTime", "dinner"];

function parsePagination(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= maximum ? parsed : null;
}

function validRange(from, to) {
  if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) return false;
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 <= 365;
}

async function getStudentFeedback(req, res, next) {
  try {
    const { date, meal } = req.query;
    if ((date && !isValidDateKey(date)) || (meal && !MEAL_NAMES.includes(meal))) {
      res.status(400).json({ message: "Provide a valid meal date and meal." });
      return;
    }
    const filter = { studentId: req.user._id };
    if (date) filter.date = date;
    if (meal) filter.meal = meal;
    const feedback = await Feedback.find(filter).sort({ date: -1, meal: 1 }).lean();
    res.json({ feedback });
  } catch (error) {
    next(error);
  }
}

async function saveFeedback(req, res, next) {
  try {
    const { date, meal, rating, feedback = "" } = req.body || {};
    if (
      !isValidDateKey(date) ||
      !MEAL_NAMES.includes(meal) ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      typeof feedback !== "string" ||
      feedback.length > 2000
    ) {
      res.status(400).json({
        message: "Provide a valid meal date, meal, a 1–5 star rating, and feedback up to 2,000 characters.",
      });
      return;
    }

    let result;
    try {
      result = await Feedback.findOneAndUpdate(
        { studentId: req.user._id, date, meal },
        {
          $set: { rating, feedback: feedback.trim() },
          $setOnInsert: { studentId: req.user._id, date, meal },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
          includeResultMetadata: true,
        }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      result = await Feedback.findOneAndUpdate(
        { studentId: req.user._id, date, meal },
        { $set: { rating, feedback: feedback.trim() } },
        { new: true, runValidators: true }
      );
      res.json({ feedback: result, updated: true });
      return;
    }

    const created = result.lastErrorObject?.updatedExisting === false;
    const savedFeedback = result.value;
    let emailStatus = "not-sent";
    if (created) {
      const student = {
        name: req.user.name,
        identifier: String(req.user._id),
      };
      const emailResult = await sendFeedbackNotification(savedFeedback, student);
      emailStatus = emailResult.status;
    }
    res.json({ feedback: savedFeedback, updated: !created, emailStatus });
  } catch (error) {
    next(error);
  }
}

async function getAdminFeedback(req, res, next) {
  try {
    const { from, to, meal, rating, search = "", page: pageValue, limit: limitValue } = req.query;
    const page = parsePagination(pageValue, 1, 100000);
    const limit = parsePagination(limitValue, 25, 100);
    const ratingValue = rating === undefined || rating === "" ? null : Number(rating);
    if (
      (from && !isValidDateKey(from)) ||
      (to && !isValidDateKey(to)) ||
      (Boolean(from) !== Boolean(to)) ||
      (from && !validRange(from, to)) ||
      (meal && !MEAL_NAMES.includes(meal)) ||
      (ratingValue !== null && (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5)) ||
      typeof search !== "string" ||
      search.length > 100 ||
      !page ||
      !limit
    ) {
      res.status(400).json({ message: "Provide valid feedback filters and pagination values." });
      return;
    }

    const filter = {};
    if (from) filter.date = { $gte: from, $lte: to };
    if (meal) filter.meal = meal;
    if (ratingValue !== null) filter.rating = ratingValue;
    if (search.trim()) filter.feedback = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

    const [feedback, total, summaries] = await Promise.all([
      Feedback.find(filter)
        .populate("studentId", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Feedback.countDocuments(filter),
      Feedback.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$meal",
            averageRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
            lowRatingCount: { $sum: { $cond: [{ $lte: ["$rating", 2] }, 1, 0] } },
          },
        },
      ]),
    ]);
    const reviewCount = summaries.reduce((sum, item) => sum + item.reviewCount, 0);
    const averageRating = reviewCount
      ? summaries.reduce((sum, item) => sum + item.averageRating * item.reviewCount, 0) / reviewCount
      : null;
    res.json({
      feedback,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      averageRating,
      reviewCount,
      mealSummaries: Object.fromEntries(
        MEAL_NAMES.map((name) => {
          const item = summaries.find((summary) => summary._id === name);
          return [name, item
            ? { averageRating: item.averageRating, reviewCount: item.reviewCount, lowRatingCount: item.lowRatingCount }
            : { averageRating: null, reviewCount: 0, lowRatingCount: 0 }];
        })
      ),
    });
  } catch (error) {
    next(error);
  }
}

async function markFeedbackReviewed(req, res, next) {
  try {
    const { reviewed } = req.body || {};
    if (typeof reviewed !== "boolean" || !mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ message: "Provide a valid feedback record and reviewed status." });
      return;
    }
    const feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          reviewed,
          reviewedBy: reviewed ? req.user._id : null,
          reviewedAt: reviewed ? new Date() : null,
        },
      },
      { new: true, runValidators: true }
    );
    if (!feedback) {
      res.status(404).json({ message: "Feedback was not found." });
      return;
    }
    res.json({ feedback });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAdminFeedback,
  getStudentFeedback,
  markFeedbackReviewed,
  saveFeedback,
};
