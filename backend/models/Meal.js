const mongoose = require("mongoose");

const choiceSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["eat", "skip", "not-selected"],
      default: "not-selected",
    },
    mealType: {
      type: String,
      enum: ["veg", "nonVeg", null],
      default: null,
    },
  },
  { _id: false }
);

const mealSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    breakfast: { type: choiceSchema, default: () => ({}) },
    lunch: { type: choiceSchema, default: () => ({}) },
    teaTime: { type: choiceSchema, default: () => ({}) },
    dinner: { type: choiceSchema, default: () => ({}) },
  },
  { timestamps: true }
);

mealSchema.index({ studentId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Meal", mealSchema);
