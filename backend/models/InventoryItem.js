const mongoose = require("mongoose");

const inventoryUnits = ["g", "kg", "ml", "L", "piece"];
const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["received", "used"], required: true },
    quantity: { type: Number, required: true, min: 0.000001, max: 1000000000 },
    unit: { type: String, enum: inventoryUnits, required: true },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    itemKey: { type: String, required: true, trim: true, maxlength: 80 },
    currentQuantity: { type: Number, required: true, min: 0, max: 1000000000, default: 0 },
    unit: { type: String, required: true, enum: inventoryUnits },
    lowStockThreshold: { type: Number, required: true, min: 0, max: 1000000000, default: 0 },
    supplier: { type: String, trim: true, maxlength: 120, default: "" },
    purchaseDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, default: null },
    expiryDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, default: null },
    transactions: { type: [transactionSchema], default: [] },
  },
  { timestamps: true }
);

inventoryItemSchema.index({ itemKey: 1 }, { unique: true });

module.exports = mongoose.model("InventoryItem", inventoryItemSchema);
