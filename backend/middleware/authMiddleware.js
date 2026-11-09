const jwt = require("jsonwebtoken");
const User = require("../models/User");
const StudentAuthorization = require("../models/StudentAuthorization");
const {
  findAuthorizationForAccount,
  normalizeStudentName,
} = require("../utils/studentIdentity");

async function authenticate(req, res, next) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ message: "Authentication is required." });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select(
      "_id name email mobile role hostel room isActive lastLoginAt rollNumber universityRegistrationNumber"
    );
    if (!user || !user.isActive) {
      res.status(401).json({ message: "This account is no longer available." });
      return;
    }
    if (user.role === "student") {
      const authorization = await findAuthorizationForAccount(
        StudentAuthorization,
        user
      );
      if (
        !authorization ||
        String(authorization.status).toUpperCase() !== "APPROVED" ||
        normalizeStudentName(authorization.fullName) !== normalizeStudentName(user.name) ||
        (authorization.email && authorization.email !== user.email)
      ) {
        res.status(401).json({ message: "This student account is not approved for access." });
        return;
      }
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      res.status(401).json({ message: "Your session is invalid or has expired." });
      return;
    }
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: "You do not have permission to do this." });
      return;
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
