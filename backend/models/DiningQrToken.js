const mongoose = require("mongoose");

const diningQrTokenSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

diningQrTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("DiningQrToken", diningQrTokenSchema);