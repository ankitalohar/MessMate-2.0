const assert = require("node:assert/strict");
const test = require("node:test");
const Notification = require("../backend/models/Notification");
const emailServices = require("../backend/services/emailServices");

const originalGetRecipients = emailServices.getApprovedActiveStudentRecipients;
const originalSendAnnouncement = emailServices.sendAnnouncementToRecipients;
emailServices.getApprovedActiveStudentRecipients = async () => ({
  totalApprovedStudents: 2,
  skippedCount: 1,
  recipients: [
    { _id: "student-1", name: "Student One", email: "student1@giet.edu", rollNumber: "R1" },
    { _id: "student-2", name: "Student Two", email: "", rollNumber: "R2" },
  ],
  emailRecipients: [
    { _id: "student-1", name: "Student One", email: "student1@giet.edu", rollNumber: "R1" },
  ],
});
emailServices.sendAnnouncementToRecipients = async (recipients) => ({
  recipientCount: recipients.length,
  sentCount: recipients.length,
  failedCount: 0,
  deliveryStatus: recipients.length ? "sent" : "not-sent",
  emailResults: recipients.map((recipient) => ({
    email: recipient.email,
    status: "accepted",
    attemptedAt: new Date(),
    acceptedAt: new Date(),
  })),
});

const {
  createAnnouncement,
  retryFailedAnnouncementEmails,
  updateAnnouncement,
} = require("../backend/controllers/adminController");

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

test("publishes in-app announcement and emails selected eligible recipients", async () => {
  const original = Notification.create;
  let record;
  Notification.create = async (payload) => {
    record = payload;
    return { ...payload, save: async function save() {} };
  };
  try {
    const response = createResponse();
    await createAnnouncement({
      user: { _id: "admin-id" },
      body: { subject: "Menu update", message: "Dinner menu posted" },
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 201);
    assert.equal(record.kind, "announcement");
    assert.equal(record.published, true);
    assert.equal(record.audience, "selected");
    assert.equal(record.sentBy, "admin-id");
    assert.deepEqual(record.recipientIds, ["student-1", "student-2"]);
    assert.equal(response.body.deliverySummary.inAppNotificationsCreated, 2);
    assert.equal(response.body.deliverySummary.emailsAccepted, 1);
    assert.equal(response.body.deliverySummary.recipientsSkipped, 1);
  } finally {
    Notification.create = original;
  }
});

test("SMTP failures do not prevent in-app announcement publication", async () => {
  const originalCreate = Notification.create;
  const originalSend = emailServices.sendAnnouncementToRecipients;
  Notification.create = async (payload) => ({ ...payload, save: async function save() {} });
  emailServices.sendAnnouncementToRecipients = async (recipients) => ({
    recipientCount: recipients.length,
    sentCount: 0,
    failedCount: recipients.length,
    deliveryStatus: "failed",
    emailResults: recipients.map((recipient) => ({
      email: recipient.email,
      status: "failed",
      errorCode: "EAUTH",
      errorReason: "SMTP authentication failed.",
      attemptedAt: new Date(),
    })),
  });
  try {
    const response = createResponse();
    await createAnnouncement({
      user: { _id: "admin-id" },
      body: { subject: "Service notice", message: "Dining hall closes early." },
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.deliverySummary.inAppNotificationsCreated, 2);
    assert.equal(response.body.deliverySummary.emailsFailed, 1);
    assert.equal(response.body.announcement.emailResults[0].errorCode, "EAUTH");
  } finally {
    Notification.create = originalCreate;
    emailServices.sendAnnouncementToRecipients = originalSend;
  }
});

test("rejects expired announcements before persistence", async () => {
  const original = Notification.create;
  let writes = 0;
  Notification.create = async () => { writes += 1; };
  try {
    const response = createResponse();
    await createAnnouncement({
      user: { _id: "admin-id" },
      body: { subject: "Expired", message: "No longer current", expiresAt: "2020-01-01T00:00:00Z" },
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 400);
    assert.equal(writes, 0);
  } finally {
    Notification.create = original;
  }
});

test("updates an existing announcement without deleting its history", async () => {
  const original = Notification.findOneAndUpdate;
  let filter;
  let update;
  Notification.findOneAndUpdate = async (query, changes) => {
    filter = query;
    update = changes;
    return { _id: query._id, kind: "announcement", published: false };
  };
  try {
    const response = createResponse();
    await updateAnnouncement({
      params: { id: "507f1f77bcf86cd799439011" },
      body: { subject: "New title", message: "Updated body", published: false },
    }, response, (error) => { throw error; });
    assert.deepEqual(filter, { _id: "507f1f77bcf86cd799439011", kind: "announcement" });
    assert.equal(update.$set.published, false);
    assert.equal(response.body.announcement.published, false);
  } finally {
    Notification.findOneAndUpdate = original;
  }
});

test("retries only failed recipients without creating another in-app notification", async () => {
  const originalFindOne = Notification.findOne;
  const originalCreate = Notification.create;
  const originalSend = emailServices.sendAnnouncementToRecipients;
  let createdNotifications = 0;
  Notification.create = async () => { createdNotifications += 1; };
  Notification.findOne = async () => ({
    _id: "announcement-id",
    kind: "announcement",
    subject: "Service notice",
    message: "Dining hall closes early.",
    recipientIds: ["student-1"],
    recipientCount: 2,
    inAppCount: 2,
    inAppStatus: "created",
    sentCount: 0,
    failedCount: 1,
    skippedCount: 1,
    emailResults: [{
      email: "student1@giet.edu",
      status: "failed",
      attempts: [{ status: "failed", errorCode: "EAUTH" }],
    }],
    save: async function save() {},
  });
  emailServices.sendAnnouncementToRecipients = async (recipients) => ({
    recipientCount: recipients.length,
    sentCount: recipients.length,
    failedCount: 0,
    deliveryStatus: "sent",
    emailResults: recipients.map((recipient) => ({
      email: recipient.email,
      status: "accepted",
      attemptedAt: new Date(),
      acceptedAt: new Date(),
    })),
  });
  try {
    const response = createResponse();
    await retryFailedAnnouncementEmails({
      params: { id: "507f1f77bcf86cd799439011" },
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.deliverySummary.emailsAccepted, 1);
    assert.equal(createdNotifications, 0);
  } finally {
    Notification.findOne = originalFindOne;
    Notification.create = originalCreate;
    emailServices.sendAnnouncementToRecipients = originalSend;
  }
});

test.after(() => {
  emailServices.getApprovedActiveStudentRecipients = originalGetRecipients;
  emailServices.sendAnnouncementToRecipients = originalSendAnnouncement;
});
