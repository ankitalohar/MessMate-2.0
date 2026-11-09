const mongoose = require("mongoose");

const foodDemandPredictionSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    meal: {
      type: String,
      enum: ["breakfast", "lunch", "teaTime", "dinner"],
      required: true,
    },
    dayOfWeek: { type: String, required: true },
    eatCount: { type: Number, required: true, min: 0 },
    historicalAttendanceRate: { type: Number, required: true, min: 0, max: 1 },
    previousAttendance: { type: Number, default: null, min: 0 },
    predictedAttendance: { type: Number, required: true, min: 0 },
    actualAttendance: { type: Number, default: null, min: 0 },
    averageConsumptionPerStudentGrams: { type: Number, default: null, min: 0 },
    recommendedQuantityKg: { type: Number, default: null, min: 0 },
    historicalAttendanceDays: { type: Number, default: 0, min: 0 },
    confidence: { type: String, enum: ["high", "medium", "low", "insufficient"], required: true },
    dataAvailability: { type: String, required: true },
    model: { type: String, default: "baseline" },
  },
  { timestamps: true }
);

foodDemandPredictionSchema.index({ date: 1, meal: 1 }, { unique: true });
foodDemandPredictionSchema.index({ meal: 1, date: -1 });

module.exports = mongoose.model("FoodDemandPrediction", foodDemandPredictionSchema);