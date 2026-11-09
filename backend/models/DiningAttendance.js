const mongoose = require("mongoose");

const diningAttendanceSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    meal: {
      type: String,
      enum: ["breakfast", "lunch", "teaTime", "dinner"],
      required: true,
    },
    attendanceCount: { type: Number, required: true, min: 0, max: 1000000, validate: Number.isInteger },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

diningAttendanceSchema.index({ date: 1, meal: 1 }, { unique: true });

module.exports = mongoose.model("DiningAttendance", diningAttendanceSchema);
