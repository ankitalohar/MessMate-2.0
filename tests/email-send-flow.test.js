const assert = require("node:assert/strict");
const test = require("node:test");
const Notification = require("../backend/models/Notification");
const StudentAuthorization = require("../backend/models/StudentAuthorization");
const User = require("../backend/models/User");
const transporter = require("../server/config/email");
const { sendEmail } = require("../backend/controllers/emailController");

function response() {
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

function queryResult(value, sortable = false) {
  return {
    select() {
      return this;
    },
    sort() {
      return this;
    },
    async lean() {
      return value;
    },
  };
}

test("send all uses approved active registered addresses and reports individual transport results", async () => {
  const originals = {
    authorizationFind: StudentAuthorization.find,
    userFind: User.find,
    notificationFindOne: Notification.findOne,
    notificationCreate: Notification.create,
    verify: transporter.verify,
    sendMail: transporter.sendMail,
    emailHost: process.env.EMAIL_HOST,
    emailPort: process.env.EMAIL_PORT,
    emailUser: process.env.EMAIL_USER,
    emailPassword: process.env.EMAIL_PASSWORD,
    emailPasswordZ: process.env.EMAIL_PASSWORDZ,
    emailFrom: process.env.EMAIL_FROM,
    nodeEnv: process.env.NODE_ENV,
  };
  const approved = [
    { rollNumber: "R1", universityRegistrationNumber: "U1", fullName: "ONE STUDENT" },
    { rollNumber: "R2", universityRegistrationNumber: "U2", fullName: "TWO STUDENT" },
    { rollNumber: "R3", universityRegistrationNumber: "U3", fullName: "THREE STUDENT" },
    { rollNumber: "R4", universityRegistrationNumber: "U4", fullName: "FOUR STUDENT" },
    { rollNumber: "R5", universityRegistrationNumber: "U5", fullName: "FIVE STUDENT" },
  ];
  const users = [
    { _id: "id-1", rollNumber: "R1", universityRegistrationNumber: "U1", name: "One Student", email: "one@giet.edu" },
    { _id: "id-2", rollNumber: "R2", universityRegistrationNumber: "U2", name: "Two Student", email: "two@giet.edu" },
    { _id: "id-3", rollNumber: "R3", universityRegistrationNumber: "U3", name: "Three Student", email: "three@giet.edu" },
    { _id: "id-4", rollNumber: "R4", universityRegistrationNumber: "U4", name: "Four Student", email: "ONE@GIET.EDU" },
    { _id: "id-5", rollNumber: "R5", universityRegistrationNumber: "U5", name: "Five Student", email: "invalid@example.com" },
  ];
  const records = [];
  const attempted = [];
  StudentAuthorization.find = (filter) => {
    assert.deepEqual(filter, { status: "APPROVED" });
    return queryResult(approved);
  };
  User.find = (filter) => {
    assert.equal(filter.role, "student");
    assert.equal(filter.isActive, true);
    return queryResult(users);
  };
  Notification.findOne = async () => null;
  Notification.create = async (payload) => {
    records.push(payload);
    if (payload.kind === "email") {
      return {
        ...payload,
        _id: "email-log-id",
        async save() {},
      };
    }
    return payload;
  };
  transporter.verify = async () => {};
  transporter.sendMail = async (mail) => {
    attempted.push(mail.to);
    if (mail.to === "two@giet.edu") {
      const error = new Error("SMTP recipient rejected");
      error.code = "EENVELOPE";
      throw error;
    }
    return { accepted: [mail.to] };
  };
  Object.assign(process.env, {
    EMAIL_HOST: "smtp.test.invalid",
    EMAIL_PORT: "587",
    EMAIL_USER: "messmatenotifications@gmail.com",
    EMAIL_PASSWORD: "test-password",
    EMAIL_FROM: "messmatenotifications@gmail.com",
    NODE_ENV: "production",
  });
  delete process.env.EMAIL_PASSWORDZ;

  try {
    const res = response();
    await sendEmail({
      body: {
        subject: "Dining update",
        message: "The menu is available.",
        requestId: "e6a8117d-8390-4e88-bf8b-bbcdd29ad5f3",
        sendToAll: true,
        recipientIds: [],
      },
      user: { _id: "admin-id" },
    }, res, (error) => { throw error; });

    assert.equal(res.statusCode, 207);
    assert.deepEqual(attempted, ["one@giet.edu", "two@giet.edu", "three@giet.edu"]);
    assert.equal(res.body.result.totalApprovedStudents, 5);
    assert.equal(res.body.result.registeredEmailAddresses, 3);
    assert.equal(res.body.result.sentCount, 2);
    assert.equal(res.body.result.failedCount, 1);
    assert.equal(res.body.result.skippedCount, 2);
    assert.equal(res.body.result.emailResults.find((item) => item.email === "two@giet.edu").status, "failed");
    assert.ok(res.body.result.emailResults.every((item) => item.attemptedAt));
    assert.ok(res.body.result.emailResults.find((item) => item.status === "accepted").acceptedAt);
    assert.equal(records[0].sentBy, "admin-id");
  } finally {
    StudentAuthorization.find = originals.authorizationFind;
    User.find = originals.userFind;
    Notification.findOne = originals.notificationFindOne;
    Notification.create = originals.notificationCreate;
    transporter.verify = originals.verify;
    transporter.sendMail = originals.sendMail;
    restore("EMAIL_HOST", originals.emailHost);
    restore("EMAIL_PORT", originals.emailPort);
    restore("EMAIL_USER", originals.emailUser);
    restore("EMAIL_PASSWORD", originals.emailPassword);
    restore("EMAIL_PASSWORDZ", originals.emailPasswordZ);
    restore("EMAIL_FROM", originals.emailFrom);
    restore("NODE_ENV", originals.nodeEnv);
  }
});

test("reused request ID returns the prior result without sending again", async () => {
  const originalFindOne = Notification.findOne;
  const originalSendMail = transporter.sendMail;
  let sendCalls = 0;
  Notification.findOne = async () => ({
    subject: "Dining update",
    message: "The menu is available.",
    requestHash: require("node:crypto")
      .createHash("sha256")
      .update("Dining update\nThe menu is available.\nall")
      .digest("hex"),
    _id: "already-sent",
    recipientCount: 1,
    sentCount: 1,
    failedCount: 0,
    deliveryStatus: "sent",
  });
  transporter.sendMail = async () => { sendCalls += 1; };
  try {
    const res = response();
    await sendEmail({
      body: {
        subject: "Dining update",
        message: "The menu is available.",
        requestId: "e6a8117d-8390-4e88-bf8b-bbcdd29ad5f3",
        sendToAll: true,
        recipientIds: [],
      },
      user: { _id: "admin-id" },
    }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.result.sentCount, 1);
    assert.equal(sendCalls, 0);
  } finally {
    Notification.findOne = originalFindOne;
    transporter.sendMail = originalSendMail;
  }
});

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
