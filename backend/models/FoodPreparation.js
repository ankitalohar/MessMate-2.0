const mongoose = require("mongoose");

const FOOD_QUANTITY_UNITS = ["g", "kg", "ml", "L", "piece", "portion"];
const MEAL_NAMES = ["breakfast", "lunch", "teaTime", "dinner"];

const foodPreparationSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    meal: {
      type: String,
      required: true,
      enum: MEAL_NAMES,
    },
    foodItem: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    itemKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    quantityPrepared: {
      type: Number,
      required: true,
      min: 0,
      max: 1000000000,
    },
    quantityServed: {
      type: Number,
      required: true,
      min: 0,
      max: 1000000000,
    },
    quantityDiscarded: {
      type: Number,
      required: true,
      min: 0,
      max: 1000000000,
      default: 0,
    },
    unit: {
      type: String,
      required: true,
      enum: FOOD_QUANTITY_UNITS,
    },
    reason: { type: String, trim: true, maxlength: 300, default: "" },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

foodPreparationSchema.index(
  { date: 1, meal: 1, itemKey: 1 },
  { unique: true }
);

module.exports = mongoose.model("FoodPreparation", foodPreparationSchema);
