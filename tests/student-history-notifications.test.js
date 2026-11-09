const assert = require("node:assert/strict");
const test = require("node:test");
const Feedback = require("../backend/models/Feedback");
const Meal = require("../backend/models/Meal");
const Notification = require("../backend/models/Notification");
const { getDiningHistory, getNotifications, markNotificationRead } = require("../backend/controllers/studentController");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("dining history scopes meal preferences and feedback to the authenticated student", async () => {
  const originals = { mealFind: Meal.find, feedbackFind: Feedback.find };
  let mealFilter;
  let feedbackFilter;
  Meal.find = (filter) => {
    mealFilter = filter;
    return {
      sort() { return this; },
      lean: async () => [{
        date: "2026-10-12",
        breakfast: { status: "eat", mealType: "veg" },
        lunch: { status: "skip", mealType: null },
      }],
    };
  };
  Feedback.find = (filter) => {
    feedbackFilter = filter;
    return {
      sort() { return this; },
      lean: async () => [{ date: "2026-10-12", meal: "lunch", rating: 4, feedback: "Good" }],
    };
  };
  try {
    const response = createResponse();
    await getDiningHistory({
      user: { _id: "student-private-id" },
      query: { from: "2026-10-01", to: "2026-10-20", meal: "lunch" },
    }, response, (error) => { throw error; });
    assert.deepEqual(mealFilter, {
      studentId: "student-private-id",
      date: { $gte: "2026-10-01", $lte: "2026-10-20" },
    });
    assert.deepEqual(feedbackFilter, {
      studentId: "student-private-id",
      date: { $gte: "2026-10-01", $lte: "2026-10-20" },
      meal: "lunch",
    });
    assert.deepEqual(response.body.meals[0].choices, {
      lunch: { status: "skip", mealType: null },
    });
    assert.deepEqual(response.body.counts, { eat: 0, skip: 1, notSelected: 0 });
    assert.equal(response.body.attendanceAvailable, false);
  } finally {
    Meal.find = originals.mealFind;
    Feedback.find = originals.feedbackFind;
  }
});

test("notification list computes read state and unread count for the authenticated student", async () => {
  const original = Notification.find;
  Notification.find = () => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => [
      { _id: "read", readBy: ["student-a"], subject: "Read" },
      { _id: "unread", readBy: [], subject: "Unread" },
    ],
  });
  try {
    const response = createResponse();
    await getNotifications({ user: { _id: "student-a" } }, response, (error) => { throw error; });
    assert.equal(response.body.notifications[0].isRead, true);
    assert.equal(response.body.notifications[1].isRead, false);
    assert.equal(response.body.notifications[0].readBy, undefined);
    assert.equal(response.body.unreadCount, 1);
  } finally {
    Notification.find = original;
  }
});

test("mark-read updates only eligible notification records through readBy", async () => {
  const original = Notification.findOneAndUpdate;
  let filter;
  let update;
  Notification.findOneAndUpdate = async (query, change) => {
    filter = query;
    update = change;
    return { _id: "notification-id" };
  };
  try {
    const response = createResponse();
    await markNotificationRead({
      params: { id: "507f1f77bcf86cd799439011" },
      user: { _id: "student-a" },
    }, response, (error) => { throw error; });
    assert.equal(filter._id, "507f1f77bcf86cd799439011");
    assert.deepEqual(update.$addToSet, { readBy: "student-a" });
    assert.equal(response.body.success, true);
  } finally {
    Notification.findOneAndUpdate = original;
  }
});
