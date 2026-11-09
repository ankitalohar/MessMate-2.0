const mongoose = require("mongoose");
const InventoryItem = require("../models/InventoryItem");
const { getDateKey, isValidDateKey } = require("../utils/date");

const UNITS = ["g", "kg", "ml", "L", "piece"];
const MAX_QUANTITY = 1000000000;

function validQuantity(value, allowZero = false) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value <= MAX_QUANTITY &&
    (allowZero ? value >= 0 : value > 0);
}

async function getInventory(req, res, next) {
  try {
    const { search = "", lowStock = "", expiringWithin = "" } = req.query;
    if (
      typeof search !== "string" ||
      search.length > 100 ||
      !["", "true", "false"].includes(lowStock) ||
      (expiringWithin && (!/^\d+$/.test(String(expiringWithin)) || Number(expiringWithin) > 365))
    ) {
      res.status(400).json({ message: "Provide valid inventory search and filter values." });
      return;
    }
    const items = await InventoryItem.find()
      .sort({ name: 1 })
      .lean();
    const today = getDateKey();
    const endDate = new Date(`${today}T00:00:00.000Z`);
    endDate.setUTCDate(endDate.getUTCDate() + Number(expiringWithin || 0));
    const endKey = endDate.toISOString().slice(0, 10);
    const searchText = search.trim().toLowerCase();
    const filtered = items.map((item) => ({
      ...item,
      isLowStock: item.currentQuantity <= item.lowStockThreshold,
      isExpiringSoon: Boolean(item.expiryDate && item.expiryDate >= today && item.expiryDate <= endKey),
      isExpired: Boolean(item.expiryDate && item.expiryDate < today),
    })).filter((item) =>
      (!searchText || item.name.toLowerCase().includes(searchText) || item.supplier.toLowerCase().includes(searchText)) &&
      (lowStock !== "true" || item.isLowStock) &&
      (!expiringWithin || item.isExpiringSoon)
    );
    res.json({ items: filtered });
  } catch (error) {
    next(error);
  }
}

async function createInventoryItem(req, res, next) {
  try {
    const {
      name,
      quantity = 0,
      unit,
      lowStockThreshold = 0,
      supplier = "",
      purchaseDate = null,
      expiryDate = null,
    } = req.body || {};
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 80 ||
      !validQuantity(quantity, true) ||
      !UNITS.includes(unit) ||
      !validQuantity(lowStockThreshold, true) ||
      typeof supplier !== "string" ||
      supplier.length > 120 ||
      (purchaseDate && !isValidDateKey(purchaseDate)) ||
      (expiryDate && !isValidDateKey(expiryDate))
    ) {
      res.status(400).json({ message: "Provide a valid inventory name, quantity, unit, threshold, and optional dates." });
      return;
    }
    const itemName = name.trim();
    const transactions = quantity > 0
      ? [{
          type: "received",
          quantity,
          unit,
          note: "Opening stock",
          recordedBy: req.user._id,
        }]
      : [];
    try {
      const item = await InventoryItem.create({
        name: itemName,
        itemKey: itemName.toLowerCase(),
        currentQuantity: quantity,
        unit,
        lowStockThreshold,
        supplier: supplier.trim(),
        purchaseDate,
        expiryDate,
        transactions,
      });
      res.status(201).json({ item });
    } catch (error) {
      if (error.code !== 11000) throw error;
      res.status(409).json({ message: "An inventory item with that name already exists." });
    }
  } catch (error) {
    next(error);
  }
}

async function updateInventoryItem(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ message: "Provide a valid inventory item identifier." });
      return;
    }
    const { name, lowStockThreshold, supplier = "", purchaseDate = null, expiryDate = null } = req.body || {};
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 80 ||
      !validQuantity(lowStockThreshold, true) ||
      typeof supplier !== "string" ||
      supplier.length > 120 ||
      (purchaseDate && !isValidDateKey(purchaseDate)) ||
      (expiryDate && !isValidDateKey(expiryDate))
    ) {
      res.status(400).json({ message: "Provide a valid item name, low-stock threshold, supplier, and optional dates." });
      return;
    }
    const itemName = name.trim();
    try {
      const item = await InventoryItem.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            name: itemName,
            itemKey: itemName.toLowerCase(),
            lowStockThreshold,
            supplier: supplier.trim(),
            purchaseDate,
            expiryDate,
          },
        },
        { new: true, runValidators: true }
      );
      if (!item) {
        res.status(404).json({ message: "Inventory item was not found." });
        return;
      }
      res.json({ item });
    } catch (error) {
      if (error.code !== 11000) throw error;
      res.status(409).json({ message: "An inventory item with that name already exists." });
    }
  } catch (error) {
    next(error);
  }
}

async function recordInventoryTransaction(req, res, next) {
  try {
    const { type, quantity, unit, note = "" } = req.body || {};
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !["received", "used"].includes(type) ||
      !validQuantity(quantity) ||
      !UNITS.includes(unit) ||
      typeof note !== "string" ||
      note.length > 300
    ) {
      res.status(400).json({ message: "Provide a valid item, transaction type, positive quantity, unit, and optional note." });
      return;
    }
    const item = await InventoryItem.findById(req.params.id).select("unit");
    if (!item) {
      res.status(404).json({ message: "Inventory item was not found." });
      return;
    }
    if (item.unit !== unit) {
      res.status(400).json({ message: `Use the inventory item's configured unit (${item.unit}).` });
      return;
    }
    const change = type === "received" ? quantity : -quantity;
    const filter = { _id: req.params.id };
    if (type === "used") filter.currentQuantity = { $gte: quantity };
    else filter.currentQuantity = { $lte: MAX_QUANTITY - quantity };
    const updated = await InventoryItem.findOneAndUpdate(
      filter,
      {
        $inc: { currentQuantity: change },
        $push: {
          transactions: {
            type,
            quantity,
            unit,
            note: note.trim(),
            recordedBy: req.user._id,
          },
        },
      },
      { new: true, runValidators: true }
    );
    if (!updated) {
      res.status(409).json({ message: "This stock transaction would exceed available inventory limits." });
      return;
    }
    res.json({ item: updated });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createInventoryItem,
  getInventory,
  recordInventoryTransaction,
  updateInventoryItem,
};
