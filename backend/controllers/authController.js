const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const StudentAuthorization = require("../models/StudentAuthorization");
const {
  GIET_STUDENT_EMAIL_SUFFIX,
  isGietStudentEmail,
  isValidEmailFormat,
  normalizeEmail,
} = require("../utils/email");
const {
  findAuthorizationForAccount,
  findAuthorizationCandidates,
  matchesStudentIdentity,
  normalizeStudentId,
  normalizeStudentName,
} = require("../utils/studentIdentity");

const mobilePattern = /^[+()\d\s-]{7,20}$/;
const STUDENT_REGISTRATION_EMAIL_ERROR =
  "Only GIET student email addresses ending with @giet.edu are allowed.";
const STUDENT_LOGIN_EMAIL_ERROR =
  "Student login is only available for GIET email addresses ending with @giet.edu.";

function cleanUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    hostel: user.hostel,
    room: user.room,
  };
}

function validInvitationKey(supplied, expected) {
  if (
    typeof supplied !== "string" ||
    typeof expected !== "string" ||
    !supplied ||
    !expected
  ) {
    return false;
  }
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

async function register(req, res, next) {
  try {
    const {
      name,
      email,
      mobile,
      password,
      confirmPassword,
      role = "student",
      hostel = "",
      room = "",
      adminRegistrationKey,
      rollNumber,
      universityRegistrationNumber,
    } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const normalizedRollNumber = normalizeStudentId(rollNumber);
    const normalizedRegistrationNumber = normalizeStudentId(universityRegistrationNumber);
    const normalizedName = normalizeStudentName(name);

    if (
      role === "student" &&
      !normalizedEmail.endsWith(GIET_STUDENT_EMAIL_SUFFIX)
    ) {
      res.status(400).json({
        success: false,
        message: STUDENT_REGISTRATION_EMAIL_ERROR,
      });
      return;
    }

    let authorization;
    if (role === "student") {
      if (!normalizedRollNumber || !normalizedRegistrationNumber) {
        res.status(400).json({
          success: false,
          message: "Student roll number and university registration number are required.",
        });
        return;
      }
      const identityCandidates = await findAuthorizationCandidates(
        StudentAuthorization,
        normalizedRollNumber,
        normalizedRegistrationNumber
      );
      authorization = identityCandidates.find((candidate) =>
        matchesStudentIdentity(candidate, normalizedRollNumber, normalizedRegistrationNumber)
      );
      if (!authorization) {
        res.status(403).json({
          success: false,
          code: identityCandidates.length ? "STUDENT_IDENTITY_MISMATCH" : "STUDENT_NOT_FOUND",
          message: identityCandidates.length
            ? "The roll number and university registration number do not match the same approved student."
            : "Student identity not found. Use Request Access to request approval.",
        });
        return;
      }
      if (authorization.status === "DEACTIVATED") {
        res.status(403).json({
          success: false,
          code: "STUDENT_DEACTIVATED",
          message: "This student account is deactivated. Contact an administrator.",
        });
        return;
      }
      if (authorization.status === "REJECTED") {
        res.status(403).json({
          success: false,
          code: "STUDENT_REJECTED",
          message: "Your student access request was rejected. Contact an administrator.",
        });
        return;
      }
      if (authorization.status === "PENDING") {
        res.status(403).json({
          success: false,
          code: "STUDENT_PENDING",
          message: "Your student access request is pending admin approval.",
        });
        return;
      }
      if (normalizeStudentName(authorization.fullName) !== normalizedName) {
        res.status(403).json({
          success: false,
          code: "STUDENT_IDENTITY_MISMATCH",
          message: "The full name does not match the approved student identity.",
        });
        return;
      }
      if (authorization.email && authorization.email !== normalizedEmail) {
        res.status(403).json({
          success: false,
          code: "STUDENT_EMAIL_MISMATCH",
          message: "This approved student identity is linked to a different registered email.",
        });
        return;
      }

      const existingStudent = (await findAuthorizationCandidates(
        User,
        normalizedRollNumber,
        normalizedRegistrationNumber
      )).find((candidate) =>
        matchesStudentIdentity(candidate, normalizedRollNumber, normalizedRegistrationNumber)
      );
      const registeredEmailAccount = authorization.email === normalizedEmail
        ? await User.findOne({ email: normalizedEmail, role: "student" }).select("name")
        : null;
      const registeredIdentity =
        existingStudent ||
        (registeredEmailAccount &&
        normalizeStudentName(registeredEmailAccount.name) === normalizedName
          ? registeredEmailAccount
          : null);
      if (registeredIdentity) {
        res.status(409).json({
          success: false,
          code: "STUDENT_ALREADY_REGISTERED",
          message: "This student identity is already registered. Sign in with the existing account.",
        });
        return;
      }
    }

    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 100 ||
      typeof email !== "string" ||
      !isValidEmailFormat(normalizedEmail) ||
      normalizedEmail.length > 254 ||
      typeof mobile !== "string" ||
      !mobilePattern.test(mobile.trim()) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128 ||
      password !== confirmPassword ||
      !["student", "admin"].includes(role) ||
      typeof hostel !== "string" ||
      hostel.trim().length > 100 ||
      typeof room !== "string" ||
      room.trim().length > 30
    ) {
      res.status(400).json({
        success: false,
        message: "Please provide valid registration details.",
      });
      return;
    }

    if (role === "admin") {
      const suppliedKey =
        typeof adminRegistrationKey === "string"
          ? adminRegistrationKey.trim()
          : "";
      if (!suppliedKey) {
        res.status(403).json({
          success: false,
          message: "A valid admin invitation key is required.",
        });
        return;
      }
      if (!validInvitationKey(suppliedKey, process.env.ADMIN_REGISTRATION_KEY)) {
        res.status(403).json({
          success: false,
          message: "Invalid admin invitation key.",
        });
        return;
      }
    }

    const existingUser = await User.exists({ email: normalizedEmail });
    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: role === "student" ? authorization.fullName : name.trim(),
      email: normalizedEmail,
      mobile: mobile.trim(),
      password: passwordHash,
      role,
      hostel: hostel.trim(),
      room: room.trim(),
      ...(role === "student"
        ? {
            rollNumber: normalizedRollNumber,
            universityRegistrationNumber: normalizedRegistrationNumber,
          }
        : {}),
      lastLoginAt: new Date(),
    });

    if (authorization) {
      authorization.email = normalizedEmail;
      await authorization.save();
    }

    const token = jwt.sign(
      { sub: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "12h" }
    );
    res.status(201).json({
      success: true,
      message: "Registration successful!",
      token,
      user: cleanUser(user),
    });
  } catch (err) {
    if (err.code === 11000) {
      res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
      return;
    }
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password, role } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (
      role === "student" &&
      !normalizedEmail.endsWith(GIET_STUDENT_EMAIL_SUFFIX)
    ) {
      res.status(400).json({
        success: false,
        message: STUDENT_LOGIN_EMAIL_ERROR,
      });
      return;
    }

    if (
      typeof email !== "string" ||
      !isValidEmailFormat(normalizedEmail) ||
      typeof password !== "string" ||
      !["student", "admin"].includes(role)
    ) {
      res.status(400).json({
        success: false,
        message: "Please enter a valid email and password.",
      });
      return;
    }

    const user = await User.findOne({ email: normalizedEmail }).select(
      "+password"
    );
    if (user?.role === "student") {
      const authorization = await findAuthorizationForAccount(
        StudentAuthorization,
        user
      );
      if (!authorization) {
        res.status(403).json({ success: false, code: "STUDENT_NOT_FOUND", message: "This student identity is not authorized." });
        return;
      }
      if (authorization.status === "PENDING") {
        res.status(403).json({ success: false, code: "STUDENT_PENDING", message: "Your student access request is pending admin approval." });
        return;
      }
      if (authorization.status === "REJECTED") {
        res.status(403).json({ success: false, code: "STUDENT_REJECTED", message: "Your student access request was rejected. Contact an administrator." });
        return;
      }
      if (authorization.status === "DEACTIVATED" || !user.isActive) {
        res.status(403).json({ success: false, code: "STUDENT_DEACTIVATED", message: "This student account is deactivated. Contact an administrator." });
        return;
      }
      if (
        authorization.status !== "APPROVED" ||
        normalizeStudentName(authorization.fullName) !== normalizeStudentName(user.name) ||
        normalizeEmail(authorization.email) !== normalizedEmail
      ) {
        res.status(403).json({
          success: false,
          code: "STUDENT_IDENTITY_MISMATCH",
          message: "This student account does not match its approved identity.",
        });
        return;
      }
      if (!user.rollNumber || !user.universityRegistrationNumber) {
        user.rollNumber = normalizeStudentId(authorization.rollNumber);
        user.universityRegistrationNumber = normalizeStudentId(
          authorization.universityRegistrationNumber
        );
      }
    }
    if (
      !user ||
      !user.isActive ||
      user.role !== role ||
      !(await bcrypt.compare(password, user.password))
    ) {
      res.status(401).json({
        success: false,
        message: "Email, password, or account type is incorrect.",
      });
      return;
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      { sub: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "12h" }
    );
    res.json({ success: true, token, user: cleanUser(user) });
  } catch (err) {
    next(err);
  }
}

async function requestStudentAccess(req, res, next) {
  try {
    const {
      rollNumber,
      universityRegistrationNumber,
      name,
      email,
    } = req.body || {};
    const normalizedRollNumber = normalizeStudentId(rollNumber);
    const normalizedRegistrationNumber = normalizeStudentId(universityRegistrationNumber);
    const normalizedName = normalizeStudentName(name);
    const normalizedEmail = normalizeEmail(email);
    if (
      !normalizedRollNumber ||
      !normalizedRegistrationNumber ||
      normalizedRollNumber.length > 30 ||
      normalizedRegistrationNumber.length > 40 ||
      normalizedName.length < 2 ||
      normalizedName.length > 100 ||
      !isGietStudentEmail(normalizedEmail)
    ) {
      res.status(400).json({
        success: false,
        message: "Provide valid student IDs, full name, and a GIET email address.",
      });
      return;
    }

    const candidates = await findAuthorizationCandidates(
      StudentAuthorization,
      normalizedRollNumber,
      normalizedRegistrationNumber
    );
    const existing = candidates.find((candidate) =>
      matchesStudentIdentity(candidate, normalizedRollNumber, normalizedRegistrationNumber)
    );
    if (existing) {
      const sameIdentity =
        matchesStudentIdentity(existing, normalizedRollNumber, normalizedRegistrationNumber) &&
        normalizeStudentName(existing.fullName) === normalizedName;
      if (!sameIdentity) {
        res.status(409).json({
          success: false,
          message: "These student IDs do not match an authorized identity. Contact an administrator.",
        });
        return;
      }
      if (candidates.length) {
        res.status(409).json({
          success: false,
          message: "These student IDs do not match the same student identity. Check both numbers and try again.",
        });
        return;
      }
      if (existing.status === "APPROVED") {
        res.status(409).json({
          success: false,
          message: "This identity is approved. Complete registration using its approved details.",
        });
        return;
      }
      if (existing.status === "DEACTIVATED") {
        res.status(403).json({
          success: false,
          message: "This student identity is deactivated. Contact an administrator.",
        });
        return;
      }
      if (existing.status === "REJECTED") {
        res.status(403).json({
          success: false,
          message: "Your access request was rejected. Contact an administrator.",
        });
        return;
      }
      if (existing.status === "PENDING") {
        res.status(409).json({
          success: false,
          message: "Your access request has already been submitted. Please wait for admin approval.",
        });
        return;
      }
      res.status(403).json({
        success: false,
        message: "This access request was rejected or deactivated. Contact an administrator.",
      });
      return;
    }

    await StudentAuthorization.create({
      rollNumber: normalizedRollNumber,
      universityRegistrationNumber: normalizedRegistrationNumber,
      fullName: normalizedName,
      email: normalizedEmail,
      status: "PENDING",
      statusSource: "ACCESS_REQUEST",
      requestedAt: new Date(),
    });
    res.status(201).json({
      success: true,
      message: "Your access request has been submitted. Please wait for admin approval.",
    });
  } catch (err) {
    if (err.code === 11000) {
      res.status(409).json({
        success: false,
        message: "A student access record already exists for these details.",
      });
      return;
    }
    next(err);
  }
}

async function profile(req, res) {
  res.json({ user: cleanUser(req.user) });
}

module.exports = {
  login,
  profile,
  register,
  requestStudentAccess,
};
