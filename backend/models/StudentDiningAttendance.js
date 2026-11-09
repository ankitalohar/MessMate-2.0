const mongoose = require("mongoose");

const studentDiningAttendanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    meal: {
      type: String,
      enum: ["breakfast", "lunch", "teaTime", "dinner"],
      required: true,
    },
    scannedAt: { type: Date, required: true },
    status: { type: String, enum: ["present"], default: "present", required: true },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

studentDiningAttendanceSchema.index(
  { studentId: 1, date: 1, meal: 1 },
  { unique: true }
);
studentDiningAttendanceSchema.index({ date: 1, meal: 1 });

module.exports = mongoose.model("StudentDiningAttendance", studentDiningAttendanceSchema);