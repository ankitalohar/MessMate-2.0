const express = require("express");
const rateLimit = require("express-rate-limit");
const { getEmailRecipients, sendEmail } = require("../controllers/emailController");
const { authenticate, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();
const emailRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Email sending is temporarily rate limited. Try again later." },
});

router.use(authenticate, requireRole("admin"));
router.get("/email-recipients", getEmailRecipients);
router.post("/send-email", emailRateLimit, sendEmail);

module.exports = router;
