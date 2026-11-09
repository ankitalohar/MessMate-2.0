const express = require("express");
const {
  getStudentFeedback,
  saveFeedback,
} = require("../controllers/feedbackController");
const {
  getMealPreferences,
  getDiningHistory,
  getMenu,
  getNotifications,
  getProfile,
  markNotificationRead,
  saveMealPreferences,
  saveMealPreference,
} = require("../controllers/studentController");
const { authenticate, requireRole } = require("../middleware/authMiddleware");
const {
  getDiningQr,
  getStudentAttendanceHistory,
} = require("../controllers/diningScanController");

const router = express.Router();
router.use(authenticate, requireRole("student"));
router.get("/profile", getProfile);
router.get("/menu", getMenu);
router.get("/meals", getMealPreferences);
router.get("/history", getDiningHistory);
router.get("/attendance", getStudentAttendanceHistory);
router.post("/dining-qr", getDiningQr);
router.get("/notifications", getNotifications);
router.patch("/notifications/:id/read", markNotificationRead);
router.get("/feedback", getStudentFeedback);
router.put("/feedback", saveFeedback);
router.post("/meals", saveMealPreference);
router.put("/meals", (req, res, next) => {
  if (req.body && Object.hasOwn(req.body, "meals")) {
    return saveMealPreferences(req, res, next);
  }
  return saveMealPreference(req, res, next);
});

module.exports = router;
