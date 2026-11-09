const path = require("path");

// 1. Load environment variables FIRST
require("dotenv").config({
    path: path.join(__dirname, "..", "..", "server", ".env")
});

// 2. Import transporter AFTER loading .env
const emailTransporter = require("../../server/config/email");

const {
    isValidEmailFormat,
    normalizeEmail
} = require("../utils/email");
const StudentAuthorization = require("../models/StudentAuthorization");
const User = require("../models/User");
const {
    normalizeStudentId,
    normalizeStudentName
} = require("../utils/studentIdentity");

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function buildAnnouncementEmail(name, subject, message) {
    const greetingName = typeof name === "string" && name.trim()
        ? escapeHtml(name.trim())
        : "there";
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\r?\n/g, "<br>");
    return {
        text: `Hello ${typeof name === "string" && name.trim() ? name.trim() : "there"},\n\n${subject}\n\n${message}\n\nThank you,\nMessMate Team`,
        html: `<!doctype html><html><body style="margin:0;background:#f3f5f8;font-family:Arial,sans-serif;color:#14243a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#f3f5f8"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="padding:22px 28px;background:#14243a;color:#fff;font-size:20px;font-weight:bold">MessMate</td></tr><tr><td style="padding:28px"><p style="margin:0 0 16px">Hello ${greetingName},</p><h1 style="margin:0 0 18px;font-size:22px;color:#14243a">${safeSubject}</h1><p style="margin:0;line-height:1.65">${safeMessage}</p><p style="margin:26px 0 0;line-height:1.6">Thank you,<br><strong>MessMate Team</strong></p></td></tr><tr><td style="padding:14px 28px;background:#f8f9fb;color:#657386;font-size:12px">This announcement was sent from MessMate.</td></tr></table></td></tr></table></body></html>`
    };
}

async function getApprovedActiveStudentRecipients() {
    const approvedStudents = await StudentAuthorization.find({ status: "APPROVED" })
        .select("rollNumber universityRegistrationNumber fullName email")
        .lean();
    if (!approvedStudents.length) {
        return {
            totalApprovedStudents: 0,
            recipients: [],
            emailRecipients: [],
            skippedCount: 0
        };
    }

    const approvedByRoll = new Map(
        approvedStudents.map(student => [normalizeStudentId(student.rollNumber), student])
    );
    const approvedEmails = approvedStudents
        .map(student => normalizeEmail(student.email))
        .filter(Boolean);
    const accounts = await User.find({
        role: "student",
        isActive: true,
        $or: [
            { rollNumber: { $in: [...approvedByRoll.keys()] } },
            { email: { $in: approvedEmails } }
        ]
    })
        .select("_id name email rollNumber universityRegistrationNumber isActive")
        .sort({ name: 1 })
        .lean();

    const recipients = [];
    for (const account of accounts) {
        const accountRoll = normalizeStudentId(account.rollNumber);
        const accountRegistration = normalizeStudentId(account.universityRegistrationNumber);
        const byIdentity = approvedByRoll.get(accountRoll);
        const authorization = byIdentity &&
            normalizeStudentId(byIdentity.universityRegistrationNumber) === accountRegistration
            ? byIdentity
            : approvedStudents.find(student =>
                normalizeEmail(student.email) === normalizeEmail(account.email) &&
                normalizeStudentName(student.fullName) === normalizeStudentName(account.name)
            );
        if (
            !authorization ||
            normalizeStudentName(authorization.fullName) !== normalizeStudentName(account.name) ||
            (authorization.email && normalizeEmail(authorization.email) !== normalizeEmail(account.email))
        ) {
            continue;
        }
        recipients.push({
            _id: account._id,
            name: account.name,
            email: typeof account.email === "string" ? normalizeEmail(account.email) : "",
            rollNumber: account.rollNumber || authorization.rollNumber
        });
    }

    const byEmail = new Map();
    for (const recipient of recipients) {
        if (!isValidEmailFormat(recipient.email) || byEmail.has(recipient.email)) continue;
        byEmail.set(recipient.email, recipient);
    }
    const emailRecipients = [...byEmail.values()];
    return {
        totalApprovedStudents: approvedStudents.length,
        recipients,
        emailRecipients,
        skippedCount: Math.max(0, approvedStudents.length - emailRecipients.length)
    };
}


// ==========================================
// ERROR HANDLING
// ==========================================

function safeErrorCode(error) {
    const code =
        typeof error?.code === "string"
            ? error.code
            : "SMTP_ERROR";

    return /^[A-Z0-9_-]{1,32}$/i.test(code)
        ? code.toUpperCase()
        : "SMTP_ERROR";
}


function safeSmtpResponse(response) {
    if (typeof response !== "string") return "";

    let value = response
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const secretKeys = [
        "EMAIL_PASSWORD",
        "JWT_SECRET",
        "MONGODB_URI",
        "ADMIN_REGISTRATION_KEY"
    ];

    for (const key of secretKeys) {
        const secret = process.env[key];

        if (secret) {
            value = value.replaceAll(secret, "[REDACTED]");
        }
    }

    return value.slice(0, 300);
}


function logSmtpFailure(operation, error) {
    const diagnostic = {
        operation,
        code: safeErrorCode(error)
    };

    if (Number.isInteger(error?.responseCode)) {
        diagnostic.responseCode = error.responseCode;
    }

    const response = safeSmtpResponse(error?.response);

    if (response) {
        diagnostic.response = response;
    }

    console.error("MessMate SMTP failure:", diagnostic);
}


function getSmtpFailureMessage(code) {
    if (code === "EAUTH") {
        return (
            "SMTP authentication failed. Check EMAIL_USER and " +
            "EMAIL_PASSWORD in server/.env. Use a valid Gmail App Password."
        );
    }

    if (
        ["ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "ESOCKET"].includes(code)
    ) {
        return (
            "Could not connect to Gmail SMTP. Check EMAIL_HOST, " +
            "EMAIL_PORT and network connectivity."
        );
    }

    return "The email provider did not accept this message.";
}


// ==========================================
// VALIDATION
// ==========================================

function validateMessage(subject, text) {
    if (
        typeof subject !== "string" ||
        !subject.trim() ||
        subject.trim().length > 160 ||
        /[\r\n]/.test(subject) ||
        typeof text !== "string" ||
        !text.trim() ||
        text.trim().length > 10000
    ) {
        throw new TypeError(
            "Provide a valid email subject and message."
        );
    }
}


function getSenderAddress() {
    const sender = normalizeEmail(
        process.env.EMAIL_FROM || process.env.EMAIL_USER
    );

    if (!isValidEmailFormat(sender)) {
        throw new Error(
            "Email sender is not configured. Check EMAIL_USER in server/.env."
        );
    }

    return sender;
}


// ==========================================
// VERIFY SMTP CONNECTION
// ==========================================

async function verifyEmailTransport() {
    try {
        await emailTransporter.verify();

        console.log("MessMate SMTP verification successful.");

        return {
            verified: true
        };

    } catch (error) {
        logSmtpFailure("verify", error);

        return {
            verified: false,
            errorCode: safeErrorCode(error),
            errorReason: getSmtpFailureMessage(
                safeErrorCode(error)
            )
        };
    }
}


// ==========================================
// SEND INDIVIDUAL EMAIL
// ==========================================

async function sendIndividualEmail(
    { to, subject, text, html },
    { verified = false } = {}
) {
    const recipient = normalizeEmail(to);
    const attemptedAt = new Date();

    if (!isValidEmailFormat(recipient)) {
        return {
            email: recipient,
            status: "failed",
            errorCode: "INVALID_RECIPIENT",
            errorReason: "Recipient email address is missing or invalid.",
            attemptedAt
        };
    }

    try {
        validateMessage(subject, text);

        if (!verified) {
            const verification = await verifyEmailTransport();

            if (!verification.verified) {
                return {
                    email: recipient,
                    status: "failed",
                    errorCode: verification.errorCode,
                    errorReason: verification.errorReason,
                    attemptedAt
                };
            }
        }

        const info = await emailTransporter.sendMail({
            from: getSenderAddress(),
            to: recipient,
            subject: subject.trim(),
            text: text.trim(),
            ...(typeof html === "string" && html ? { html } : {})
        });

        const accepted = Array.isArray(info.accepted)
            ? info.accepted.some(
                address => normalizeEmail(address) === recipient
            )
            : false;

        if (!accepted) {
            return {
                email: recipient,
                status: "failed",
                errorCode: "NOT_ACCEPTED",
                errorReason:
                    "The mail transport did not accept this recipient.",
                attemptedAt
            };
        }

        return {
            email: recipient,
            status: "accepted",
            attemptedAt,
            acceptedAt: new Date()
        };

    } catch (error) {
        logSmtpFailure("send", error);

        return {
            email: recipient,
            status: "failed",
            errorCode: safeErrorCode(error),
            errorReason:
                error instanceof TypeError
                    ? error.message
                    : getSmtpFailureMessage(safeErrorCode(error)),
            attemptedAt
        };
    }
}


// ==========================================
// SEND ANNOUNCEMENT TO MULTIPLE STUDENTS
// ==========================================

async function sendAnnouncementToRecipients(
    recipients,
    subject,
    text
) {
    validateMessage(subject, text);

    if (!Array.isArray(recipients)) {
        throw new TypeError("Recipients must be an array.");
    }

    const normalizedRecipients = [];
    const seen = new Set();

    for (const recipientValue of recipients) {
        const email = normalizeEmail(
            typeof recipientValue === "string"
                ? recipientValue
                : recipientValue?.email
        );

        if (!isValidEmailFormat(email) || seen.has(email)) {
            continue;
        }

        seen.add(email);
        normalizedRecipients.push(email);
    }

    if (normalizedRecipients.length === 0) {
        return summarizeEmailResults([]);
    }

    // Verify SMTP once before sending bulk emails
    const verification = await verifyEmailTransport();

    if (!verification.verified) {
        const attemptedAt = new Date();

        const emailResults = normalizedRecipients.map(email => ({
            email,
            status: "failed",
            errorCode: verification.errorCode,
            errorReason: verification.errorReason,
            attemptedAt
        }));

        return summarizeEmailResults(emailResults);
    }

    const emailResults = [];

    // Send individually to protect student email privacy
    for (const email of normalizedRecipients) {
        const match = recipients.find(recipient =>
            normalizeEmail(typeof recipient === "string" ? recipient : recipient?.email) === email
        );
        const content = buildAnnouncementEmail(
            typeof match === "object" ? match.name : "",
            subject,
            text
        );
        const result = await sendIndividualEmail(
            {
                to: email,
                subject,
                text: content.text,
                html: content.html
            },
            {
                verified: true
            }
        );

        emailResults.push(result);
    }

    return summarizeEmailResults(emailResults);
}


// ==========================================
// SUMMARIZE EMAIL RESULTS
// ==========================================

function summarizeEmailResults(emailResults) {
    const sentCount = emailResults.filter(
        item => item.status === "accepted"
    ).length;

    const failedCount = emailResults.filter(
        item => item.status === "failed"
    ).length;

    return {
        recipientCount: emailResults.length,
        sentCount,
        failedCount,

        deliveryStatus:
            sentCount === 0
                ? failedCount > 0 ? "failed" : "not-sent"
                : failedCount === 0
                    ? "sent"
                    : "partial",

        emailResults
    };
}


// ==========================================
// MEAL NOTIFICATION
// ==========================================

async function sendMealNotification(
    recipients,
    subject,
    message
) {
    return sendAnnouncementToRecipients(
        recipients,
        subject,
        message
    );
}


// ==========================================
// EXPORT FUNCTIONS
// ==========================================

module.exports = {
    buildAnnouncementEmail,
    getApprovedActiveStudentRecipients,
    getSmtpFailureMessage,
    logSmtpFailure,
    safeErrorCode,
    safeSmtpResponse,
    sendAnnouncementToRecipients,
    sendIndividualEmail,
    sendMealNotification,
    summarizeEmailResults,
    verifyEmailTransport
};