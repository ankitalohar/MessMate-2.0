const mongoose = require("mongoose");
const StudentAuthorization = require("../models/StudentAuthorization");
const User = require("../models/User");
const { isGietStudentEmail, normalizeEmail } = require("../utils/email");

function normalizeId(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeName(value) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toUpperCase()
    : "";
}

function validStudentDetails(body) {
  const rollNumber = normalizeId(body.rollNumber);
  const universityRegistrationNumber = normalizeId(body.universityRegistrationNumber);
  const fullName = normalizeName(body.fullName);
  const email = normalizeEmail(body.email);
  if (
    !rollNumber ||
    rollNumber.length > 30 ||
    !universityRegistrationNumber ||
    universityRegistrationNumber.length > 40 ||
    fullName.length < 2 ||
    fullName.length > 100 ||
    !isGietStudentEmail(email)
  ) {
    return null;
  }
  return { rollNumber, universityRegistrationNumber, fullName, email };
}

async function getStudentAccess(req, res, next) {
  try {
    const { status = "all", search = "" } = req.query;
    if (
      !["all", "APPROVED", "PENDING", "REJECTED", "DEACTIVATED"].includes(status) ||
      typeof search !== "string" ||
      search.length > 100
    ) {
      res.status(400).json({ message: "Student access filters are invalid." });
      return;
    }
    const filter = {};
    if (status !== "all") filter.status = status;
    if (search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(escaped, "i");
      filter.$or = [
        { rollNumber: searchRegex },
        { universityRegistrationNumber: searchRegex },
        { fullName: searchRegex },
        { email: searchRegex },
      ];
    }
    const students = await StudentAuthorization.find(filter)
      .sort({ status: 1, fullName: 1 })
      .limit(500)
      .lean();
    const users = await User.find({
      role: "student",
      rollNumber: { $in: students.map((student) => student.rollNumber) },
    })
      .select("_id rollNumber email isActive createdAt")
      .lean();
    const usersByRollNumber = new Map(users.map((user) => [user.rollNumber, user]));
    res.json({
      students: students.map((student) => ({
        ...student,
        account: usersByRollNumber.get(student.rollNumber) || null,
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function addApprovedStudent(req, res, next) {
  try {
    const details = validStudentDetails(req.body || {});
    if (!details) {
      res.status(400).json({ message: "Provide valid student IDs, full name, and a GIET email address." });
      return;
    }
    if (await User.exists({ email: details.email })) {
      res.status(409).json({ message: "That email address already belongs to an account." });
      return;
    }
    const student = await StudentAuthorization.create({
      ...details,
      status: "APPROVED",
      statusSource: "ADMIN",
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
    });
    res.status(201).json({ student, message: "Student added to the approved access list." });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ message: "A student with that roll number, registration number, or email already exists." });
      return;
    }
    next(error);
  }
}

async function reviewRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (
      !mongoose.isValidObjectId(id) ||
      !["APPROVED", "REJECTED"].includes(status)
    ) {
      res.status(400).json({ message: "Provide a valid request ID and approval decision." });
      return;
    }
    const student = await StudentAuthorization.findOne({ _id: id, status: "PENDING" });
    if (!student) {
      res.status(404).json({ message: "Pending access request was not found." });
      return;
    }
    student.status = status;
    student.statusSource = "ADMIN";
    student.reviewedBy = req.user._id;
    student.reviewedAt = new Date();
    await student.save();
    res.json({ student, message: `Student access request ${status.toLowerCase()}.` });
  } catch (error) {
    next(error);
  }
}

async function updateStudentAccess(req, res, next) {
  try {
    const { id } = req.params;
    const { action } = req.body || {};
    if (
      !mongoose.isValidObjectId(id) ||
      !["deactivate", "reactivate", "edit"].includes(action)
    ) {
      res.status(400).json({ message: "Provide a valid student access action." });
      return;
    }
    const student = await StudentAuthorization.findById(id);
    if (!student || student.status === "PENDING") {
      res.status(404).json({ message: "Approved student record was not found." });
      return;
    }
    if (action === "reactivate" && student.status !== "DEACTIVATED") {
      res.status(409).json({
        message: "Only an administratively deactivated approved student can be reactivated.",
      });
      return;
    }
    if (action === "deactivate" && student.status === "REJECTED") {
      res.status(409).json({
        message: "A rejected student request cannot be deactivated or reactivated as approved.",
      });
      return;
    }

    if (action === "edit") {
      const details = validStudentDetails(req.body);
      if (!details) {
        res.status(400).json({ message: "Provide valid student IDs, full name, and a GIET email address." });
        return;
      }
      const duplicate = await StudentAuthorization.findOne({
        _id: { $ne: student._id },
        $or: [
          { rollNumber: details.rollNumber },
          { universityRegistrationNumber: details.universityRegistrationNumber },
          { email: details.email },
        ],
      });
      if (duplicate) {
        res.status(409).json({ message: "A student with one of those IDs or email already exists." });
        return;
      }
      const account = await User.findOne({ rollNumber: student.rollNumber });
      if (account) {
        const duplicateAccount = await User.findOne({
          _id: { $ne: account._id },
          $or: [
            { email: details.email },
            { rollNumber: details.rollNumber },
            { universityRegistrationNumber: details.universityRegistrationNumber },
          ],
        });
        if (duplicateAccount) {
          res.status(409).json({ message: "Those details conflict with an existing student account." });
          return;
        }
        account.name = details.fullName;
        account.email = details.email;
        account.rollNumber = details.rollNumber;
        account.universityRegistrationNumber = details.universityRegistrationNumber;
        await account.save();
      }
      Object.assign(student, details);
    } else {
      student.status = action === "deactivate" ? "DEACTIVATED" : "APPROVED";
      student.statusSource = "ADMIN";
      const account = await User.findOne({ rollNumber: student.rollNumber });
      if (account) {
        account.isActive = action === "reactivate";
        await account.save();
      }
    }
    student.reviewedBy = req.user._id;
    student.reviewedAt = new Date();
    await student.save();
    res.json({ student, message: `Student access ${action}d.` });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ message: "A student with one of those IDs or email already exists." });
      return;
    }
    next(error);
  }
}

module.exports = {
  addApprovedStudent,
  getStudentAccess,
  reviewRequest,
  updateStudentAccess,
};
