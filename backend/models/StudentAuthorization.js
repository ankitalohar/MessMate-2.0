const mongoose = require("mongoose");

const studentAuthorizationSchema = new mongoose.Schema(
  {
    rollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 30,
    },
    universityRegistrationNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    fullName: { type: String, required: true, trim: true, uppercase: true, maxlength: 100 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      sparse: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["APPROVED", "PENDING", "REJECTED", "DEACTIVATED"],
      required: true,
      default: "PENDING",
    },
    statusSource: {
      type: String,
      enum: ["INITIAL_ROSTER", "ACCESS_REQUEST", "ADMIN"],
      default: "ACCESS_REQUEST",
    },
    requestedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

studentAuthorizationSchema.index({ rollNumber: 1 }, { unique: true });
studentAuthorizationSchema.index(
  { universityRegistrationNumber: 1 },
  { unique: true }
);

module.exports = mongoose.model("StudentAuthorization", studentAuthorizationSchema);
