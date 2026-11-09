const mongoose = require("mongoose");

const INGREDIENT_UNITS = ["g", "kg", "ml", "L", "piece"];

const ingredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    quantityPerServing: { type: Number, required: true, min: 0.000001 },
    unit: { type: String, required: true, enum: INGREDIENT_UNITS },
  },
  { _id: false }
);

const mealMenuSchema = new mongoose.Schema(
  {
    veg: { type: [String], default: [] },
    nonVeg: { type: [String], default: [] },
    ingredients: {
      veg: { type: [ingredientSchema], default: [] },
      nonVeg: { type: [ingredientSchema], default: [] },
    },
  },
  { _id: false }
);

const specialMenuMealSchema = new mongoose.Schema(
  {
    veg: { type: [String], default: [] },
    nonVeg: { type: [String], default: [] },
  },
  { _id: false }
);

const specialMenuSchema = new mongoose.Schema(
  {
    occasionName: { type: String, required: true, trim: true, maxlength: 100 },
    occasionKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    breakfast: { type: specialMenuMealSchema, default: undefined },
    lunch: { type: specialMenuMealSchema, default: undefined },
    teaTime: { type: specialMenuMealSchema, default: undefined },
    dinner: { type: specialMenuMealSchema, default: undefined },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    isPublished: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

const menuSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      unique: true,
    },
    breakfast: { type: mealMenuSchema, default: () => ({}) },
    lunch: { type: mealMenuSchema, default: () => ({}) },
    teaTime: { type: mealMenuSchema, default: () => ({}) },
    dinner: { type: mealMenuSchema, default: () => ({}) },
    isHoliday: { type: Boolean, default: false },
    specialMenus: { type: [specialMenuSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Menu", menuSchema);
