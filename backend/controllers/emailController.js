const mongoose = require("mongoose");
const crypto = require("crypto");
const Notification = require("../models/Notification");
const { isGietStudentEmail } = require("../utils/email");
const {
  getSmtpFailureMessage,
  logSmtpFailure,
  safeErrorCode,
  safeSmtpResponse,
  getApprovedActiveStudentRecipients,
  sendAnnouncementToRecipients,
  sendIndividualEmail,
} = require("../services/emailServices");

function getTransportConfig() {
  const { EMAIL_HOST, EMAIL_USER } = process.env;
  const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || process.env.EMAIL_PASSWORDZ;
  const port = Number(process.env.EMAIL_PORT);
  if (
    !EMAIL_HOST ||
    !EMAIL_USER ||
    !EMAIL_PASSWORD ||
    ![465, 587].includes(port)
  ) {
    return null;
  }
  return {
    host: EMAIL_HOST,
    port,
    secure: port === 465,
    ...(port === 587 ? { requireTLS: true } : {}),
    auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD },
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

async function sendFeedbackNotification(feedback, student) {
  if (
    process.env.NODE_ENV === "test" ||
    process.env.NODE_TEST_CONTEXT
  ) {
    return { sent: false, status: "skipped" };
  }
  if (!getTransportConfig()) return { sent: false, status: "not-configured" };

  const recipient =
    process.env.FEEDBACK_NOTIFICATION_EMAIL ||
    process.env.EMAIL_USER ||
    "messmatenotifications@gmail.com";
  const subject = `New MessMate feedback: ${feedback.meal} · ${feedback.date}`;
  const text = [
    `Meal: ${feedback.meal}`,
    `Date: ${feedback.date}`,
    `Rating: ${feedback.rating}/5`,
    `Student: ${student.name} (${student.identifier})`,
    `Feedback: ${feedback.feedback || "(no written comment)"}`,
  ].join("\n");

  const result = await sendIndividualEmail({ to: recipient, subject, text });
  return {
    sent: result.status === "accepted",
    status: result.status === "accepted" ? "sent" : "failed",
    ...(result.status === "failed" ? { errorCode: result.errorCode } : {}),
  };
}

async function getEligibleRecipients() {
  const summary = await getApprovedActiveStudentRecipients();
  const recipients = summary.emailRecipients.filter(student => isGietStudentEmail(student.email));
  return {
    totalApproved: summary.totalApprovedStudents,
    registeredEmailAddresses: recipients.length,
    skipped: Math.max(0, summary.totalApprovedStudents - recipients.length),
    recipients,
  };
}

async function getEmailRecipients(_req, res, next) {
  try {
    const { recipients } = await getEligibleRecipients();
    res.json({
      recipients: recipients.map(({ _id, name, email, rollNumber }) => ({
        id: _id,
        name,
        email,
        rollNumber,
      })),
    });
  } catch (error) {
    next(error);
  }
}

function emailResult(notification) {
  return {
    id: notification._id,
    recipientCount: notification.recipientCount,
    sentCount: notification.sentCount,
    failedCount: notification.failedCount,
    deliveryStatus: notification.deliveryStatus,
    totalApprovedStudents: notification.totalApprovedStudents || 0,
    registeredEmailAddresses: notification.registeredEmailAddresses || 0,
    skippedCount: notification.skippedCount || 0,
    emailResults: notification.emailResults || [],
  };
}

async function sendEmail(req, res, next) {
  try {
    const {
      subject,
      message,
      requestId,
      sendToAll,
      recipientIds = [],
    } = req.body || {};
    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      subject.trim().length > 160 ||
      /[\r\n]/.test(subject) ||
      typeof message !== "string" ||
      !message.trim() ||
      message.trim().length > 10000 ||
      typeof requestId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(requestId) ||
      typeof sendToAll !== "boolean" ||
      !Array.isArray(recipientIds) ||
      recipientIds.length > 500 ||
      recipientIds.some((id) => !mongoose.isValidObjectId(id)) ||
      new Set(recipientIds).size !== recipientIds.length ||
      (sendToAll && recipientIds.length > 0) ||
      (!sendToAll && recipientIds.length === 0)
    ) {
      res.status(400).json({ message: "Provide a subject, message, request ID, and a valid recipient selection." });
      return;
    }

    const recipientSelection = sendToAll
      ? "all"
      : [...recipientIds].sort().join(",");
    const requestHash = crypto
      .createHash("sha256")
      .update(`${subject.trim()}\n${message.trim()}\n${recipientSelection}`)
      .digest("hex");

    const existingRequest = await Notification.findOne({ requestId });
    if (existingRequest) {
      if (
        existingRequest.subject !== subject.trim() ||
        existingRequest.message !== message.trim() ||
        existingRequest.requestHash !== requestHash
      ) {
        res.status(409).json({ message: "This email request ID has already been used." });
        return;
      }
      res.json({
        message: "This email request was already processed; it was not sent again.",
        result: emailResult(existingRequest),
      });
      return;
    }

    const recipientSummary = await getEligibleRecipients();
    const eligible = recipientSummary.recipients;
    const eligibleById = new Map(eligible.map((student) => [student._id.toString(), student]));
    const selected = sendToAll
      ? eligible
      : recipientIds.map((id) => eligibleById.get(id)).filter(Boolean);
    if (!selected.length || (!sendToAll && selected.length !== recipientIds.length)) {
      res.status(400).json({ message: "Select one or more approved, active students with valid registered email addresses." });
      return;
    }

    const transportConfig = getTransportConfig();
    if (!transportConfig) {
      res.status(503).json({
        message: "Email is not configured correctly. Set EMAIL_HOST, EMAIL_PORT (465 or 587), EMAIL_USER, and EMAIL_PASSWORD in server/.env.",
      });
      return;
    }

    let sentCount = 0;
    let failedCount = 0;
    let firstFailureCode = null;
    let deliveryLog;
    try {
      deliveryLog = await Notification.create({
        subject: subject.trim(),
        message: message.trim(),
        kind: "email",
        sentBy: req.user._id,
        recipientCount: selected.length,
        totalApprovedStudents: recipientSummary.totalApproved,
        registeredEmailAddresses: recipientSummary.registeredEmailAddresses,
        skippedCount: recipientSummary.totalApproved - selected.length,
        deliveryStatus: "processing",
        requestId,
        requestHash,
      });
      await Notification.create({
        subject: subject.trim(),
        message: message.trim(),
        kind: "announcement",
        published: true,
        audience: "selected",
        recipientIds: selected.map((student) => student._id),
        sentBy: req.user._id,
      });
    } catch (error) {
      if (error.code === 11000) {
        const duplicate = await Notification.findOne({ requestId });
        if (duplicate) {
          res.json({
            message: "This email request was already processed; it was not sent again.",
            result: emailResult(duplicate),
          });
          return;
        }
      }
      throw error;
    }

    const delivery = await sendAnnouncementToRecipients(
      selected,
      subject.trim(),
      message.trim()
    );
    sentCount = delivery.sentCount;
    failedCount = delivery.failedCount;
    firstFailureCode = delivery.emailResults.find(
      (item) => item.status === "failed"
    )?.errorCode;
    const emailResults = delivery.emailResults;

    deliveryLog.recipientCount = selected.length;
    deliveryLog.sentCount = sentCount;
    deliveryLog.failedCount = failedCount;
    deliveryLog.deliveryStatus =
      sentCount === 0 ? "failed" : failedCount === 0 ? "sent" : "partial";
    deliveryLog.emailResults = emailResults;
    await deliveryLog.save();

    const result = {
      ...emailResult(deliveryLog),
      totalApprovedStudents: recipientSummary.totalApproved,
      registeredEmailAddresses: recipientSummary.registeredEmailAddresses,
      skippedCount: recipientSummary.skipped,
      emailResults: deliveryLog.emailResults,
    };
    if (sentCount === 0) {
      res.status(502).json({
        message: getSmtpFailureMessage(firstFailureCode),
        result,
      });
      return;
    }
    res.status(failedCount ? 207 : 200).json({
      message: failedCount
        ? "The mail transport accepted some messages; review the failed count."
        : "The mail transport accepted the messages for sending.",
      result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getEmailRecipients,
  getSmtpFailureMessage,
  getTransportConfig,
  logSmtpFailure,
  sendFeedbackNotification,
  safeSmtpResponse,
  safeErrorCode,
  sendEmail,
};
