const express = require("express");
const {
  getAttendance,
  saveAttendance,
} = require("../controllers/attendanceController");
const { exportReport, getAnalytics } = require("../controllers/reportController");
const {
  getAdminFeedback,
  markFeedbackReviewed,
} = require("../controllers/feedbackController");
const {
  createInventoryItem,
  getInventory,
  recordInventoryTransaction,
  updateInventoryItem,
} = require("../controllers/inventoryController");
const {
  createAnnouncement,
  createMenu,
  createSpecialMenu,
  deleteSpecialMenu,
  getFoodPreparation,
  getFoodQuantity,
  getAdminNotifications,
  getMeals,
  getMenu,
  getStatistics,
  getUsers,
  retryFailedAnnouncementEmails,
  saveFoodPreparation,
  setSpecialMenuPublished,
  updateMenu,
  updateSpecialMenu,
  updateAnnouncement,
  updateUserStatus,
} = require("../controllers/adminController");
const { authenticate, requireRole } = require("../middleware/authMiddleware");
const {
  getStudentAttendance,
  recordManualAttendance,
  scanDiningQr,
} = require("../controllers/diningScanController");
const {
  getFoodDemandHistory,
  predictFoodDemand,
} = require("../controllers/foodDemandController");
const {
  addApprovedStudent,
  getStudentAccess,
  reviewRequest,
  updateStudentAccess,
} = require("../controllers/studentAccessController");

const router = express.Router();
router.use(authenticate, requireRole("admin"));
router.get("/users", getUsers);
router.patch("/users/:id/status", updateUserStatus);
router.get("/student-access", getStudentAccess);
router.post("/student-access", addApprovedStudent);
router.patch("/student-access/:id/review", reviewRequest);
router.patch("/student-access/:id", updateStudentAccess);
router.get("/meals", getMeals);
router.get("/statistics", getStatistics);
router.get("/food-quantity", getFoodQuantity);
router.get("/food-preparation", getFoodPreparation);
router.put("/food-preparation", saveFoodPreparation);
router.get("/notifications", getAdminNotifications);
router.post("/announcements", createAnnouncement);
router.post("/announcements/:id/retry-failed-emails", retryFailedAnnouncementEmails);
router.patch("/announcements/:id", updateAnnouncement);
router.get("/inventory", getInventory);
router.post("/inventory", createInventoryItem);
router.patch("/inventory/:id", updateInventoryItem);
router.post("/inventory/:id/transactions", recordInventoryTransaction);
router.get("/feedback", getAdminFeedback);
router.patch("/feedback/:id/reviewed", markFeedbackReviewed);
router.get("/attendance", getAttendance);
router.put("/attendance", saveAttendance);
router.get("/attendance/students", getStudentAttendance);
router.post("/attendance/scan", scanDiningQr);
router.post("/attendance/manual", recordManualAttendance);
router.get("/food-demand", getFoodDemandHistory);
router.post("/food-demand/predict", predictFoodDemand);
router.get("/analytics", getAnalytics);
router.get("/export", exportReport);
router.get("/menu", getMenu);
router.post("/menu", createMenu);
router.put("/menu", updateMenu);
router.post("/special-menus", createSpecialMenu);
router.put("/special-menus/:id", updateSpecialMenu);
router.patch("/special-menus/:id/published", setSpecialMenuPublished);
router.delete("/special-menus/:id", deleteSpecialMenu);

module.exports = router;
