const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  login,
  profile,
  register,
  requestStudentAccess,
} = require("../controllers/authController");
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Please try again later." },
});

router.post("/register", authRateLimit, register);
router.post("/request-access", authRateLimit, requestStudentAccess);
router.post("/login", authRateLimit, login);
router.get("/profile", authenticate, profile);

module.exports = router;
