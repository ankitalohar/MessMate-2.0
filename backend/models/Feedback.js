const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    meal: {
      type: String,
      enum: ["breakfast", "lunch", "teaTime", "dinner"],
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: Number.isInteger,
    },
    feedback: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    reviewed: { type: Boolean, default: false },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

feedbackSchema.index({ studentId: 1, date: 1, meal: 1 }, { unique: true });
feedbackSchema.index({ date: -1, meal: 1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
