const mongoose = require("mongoose");
const { isGietStudentEmail } = require("../utils/email");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 254,
      validate: {
        validator(email) {
          return this.role !== "student" || isGietStudentEmail(email);
        },
        message: "Student email addresses must end with @giet.edu.",
      },
    },
    rollNumber: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      unique: true,
      maxlength: 30,
    },
    universityRegistrationNumber: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      unique: true,
      maxlength: 40,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["student", "admin"],
      default: "student",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    hostel: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    room: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
