const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 10000 },
    kind: {
      type: String,
      enum: ["email", "announcement"],
      default: "email",
    },
    category: {
      type: String,
      enum: ["announcement", "menu", "alert", "reminder", "email"],
      default: "announcement",
    },
    published: { type: Boolean, default: false },
    audience: {
      type: String,
      enum: ["students", "selected"],
      default: "students",
    },
    recipientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    expiresAt: { type: Date, default: null },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipientCount: { type: Number, min: 0, default: 0 },
    sentCount: { type: Number, min: 0, default: 0 },
    failedCount: { type: Number, min: 0, default: 0 },
    totalApprovedStudents: { type: Number, min: 0, default: 0 },
    registeredEmailAddresses: { type: Number, min: 0, default: 0 },
    skippedCount: { type: Number, min: 0, default: 0 },
    inAppCount: { type: Number, min: 0, default: 0 },
    inAppStatus: {
      type: String,
      enum: ["created", "failed"],
      default: "failed",
    },
    deliveryStatus: {
      type: String,
      enum: ["processing", "sent", "partial", "failed", "not-sent"],
      default: "not-sent",
    },
    requestId: { type: String, trim: true, maxlength: 80, sparse: true, unique: true },
    emailResults: [{
      email: { type: String, trim: true, lowercase: true },
      status: { type: String, enum: ["accepted", "failed", "skipped"] },
      attemptedAt: { type: Date, default: null },
      acceptedAt: { type: Date, default: null },
      errorCode: { type: String, maxlength: 32, default: "" },
      errorReason: { type: String, maxlength: 300, default: "" },
      attempts: [{
        status: { type: String, enum: ["accepted", "failed", "skipped"] },
        attemptedAt: { type: Date, default: null },
        acceptedAt: { type: Date, default: null },
        errorCode: { type: String, maxlength: 32, default: "" },
        errorReason: { type: String, maxlength: 300, default: "" },
      }],
    }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
