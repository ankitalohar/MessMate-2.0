const assert = require("node:assert/strict");
const test = require("node:test");
const transporter = require("../server/config/email");
const {
  sendAnnouncementToRecipients,
  sendIndividualEmail,
} = require("../backend/services/emailServices");

test("sends one email through the shared transporter after verification", async () => {
  const originals = {
    verify: transporter.verify,
    sendMail: transporter.sendMail,
    emailUser: process.env.EMAIL_USER,
    emailFrom: process.env.EMAIL_FROM,
  };
  const calls = [];
  process.env.EMAIL_USER = "messmatenotifications@gmail.com";
  process.env.EMAIL_FROM = "messmatenotifications@gmail.com";
  transporter.verify = async () => {};
  transporter.sendMail = async (message) => {
    calls.push(message);
    return { accepted: ["student@giet.edu"] };
  };
  try {
    const result = await sendIndividualEmail({
      to: " Student@GIET.EDU ",
      subject: "Menu update",
      text: "The menu is available.",
    });
    assert.equal(result.status, "accepted");
    assert.equal(result.email, "student@giet.edu");
    assert.ok(result.attemptedAt instanceof Date);
    assert.ok(result.acceptedAt instanceof Date);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].from, "messmatenotifications@gmail.com");
    assert.equal(calls[0].to, "student@giet.edu");
  } finally {
    transporter.verify = originals.verify;
    transporter.sendMail = originals.sendMail;
    restore("EMAIL_USER", originals.emailUser);
    restore("EMAIL_FROM", originals.emailFrom);
  }
});

test("bulk announcement deduplicates addresses and continues after one recipient fails", async () => {
  const originals = {
    verify: transporter.verify,
    sendMail: transporter.sendMail,
    error: console.error,
    emailUser: process.env.EMAIL_USER,
    emailFrom: process.env.EMAIL_FROM,
  };
  const sentTo = [];
  transporter.verify = async () => {};
  transporter.sendMail = async ({ to }) => {
    sentTo.push(to);
    if (to === "two@giet.edu") {
      const error = new Error("SMTP recipient rejected");
      error.code = "EENVELOPE";
      throw error;
    }
    return { accepted: [to] };
  };
  console.error = () => {};
  process.env.EMAIL_USER = "messmatenotifications@gmail.com";
  process.env.EMAIL_FROM = "messmatenotifications@gmail.com";
  try {
    const result = await sendAnnouncementToRecipients(
      ["one@giet.edu", "TWO@GIET.EDU", "one@giet.edu", "not-an-email"],
      "Dining update",
      "The menu is now available."
    );
    assert.deepEqual(sentTo, ["one@giet.edu", "two@giet.edu"]);
    assert.equal(result.recipientCount, 2);
    assert.equal(result.sentCount, 1);
    assert.equal(result.failedCount, 1);
    assert.equal(result.deliveryStatus, "partial");
    assert.equal(result.emailResults[1].errorCode, "EENVELOPE");
    assert.ok(result.emailResults[1].attemptedAt instanceof Date);
  } finally {
    transporter.verify = originals.verify;
    transporter.sendMail = originals.sendMail;
    console.error = originals.error;
    restore("EMAIL_USER", originals.emailUser);
    restore("EMAIL_FROM", originals.emailFrom);
  }
});

test("SMTP verification failure prevents any message from being sent", async () => {
  const originals = {
    verify: transporter.verify,
    sendMail: transporter.sendMail,
    error: console.error,
  };
  let sendCalls = 0;
  transporter.verify = async () => {
    const error = new Error("SMTP auth failed");
    error.code = "EAUTH";
    throw error;
  };
  transporter.sendMail = async () => { sendCalls += 1; };
  console.error = () => {};
  try {
    const result = await sendAnnouncementToRecipients(
      ["student@giet.edu"],
      "Dining update",
      "The menu is now available."
    );
    assert.equal(sendCalls, 0);
    assert.equal(result.deliveryStatus, "failed");
    assert.equal(result.sentCount, 0);
    assert.equal(result.failedCount, 1);
    assert.equal(result.emailResults[0].errorCode, "EAUTH");
    assert.match(result.emailResults[0].errorReason, /SMTP authentication failed/);
  } finally {
    transporter.verify = originals.verify;
    transporter.sendMail = originals.sendMail;
    console.error = originals.error;
  }
});

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
