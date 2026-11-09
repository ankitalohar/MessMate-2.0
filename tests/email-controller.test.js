const test = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");
const Notification = require("../backend/models/Notification");
const User = require("../backend/models/User");
const {
  getSmtpFailureMessage,
  getTransportConfig,
  logSmtpFailure,
  sendEmail,
} = require("../backend/controllers/emailController");

test("uses STARTTLS on port 587 regardless of EMAIL_SECURE", () => {
  withEmailEnvironment(
    { EMAIL_PORT: "587", EMAIL_SECURE: "true" },
    () => {
      const config = getTransportConfig();
      assert.equal(config.port, 587);
      assert.equal(config.secure, false);
      assert.equal(config.requireTLS, true);
    }
  );
});

test("uses implicit TLS on port 465 regardless of EMAIL_SECURE", () => {
  withEmailEnvironment(
    { EMAIL_PORT: "465", EMAIL_SECURE: "false" },
    () => {
      const config = getTransportConfig();
      assert.equal(config.port, 465);
      assert.equal(config.secure, true);
      assert.equal("requireTLS" in config, false);
    }
  );
});

test("rejects unsupported SMTP ports instead of guessing transport security", () => {
  withEmailEnvironment({ EMAIL_PORT: "2525" }, () => {
    assert.equal(getTransportConfig(), null);
  });
});

test("gives safe, actionable EAUTH diagnostics without exposing credentials", () => {
  const message = getSmtpFailureMessage("EAUTH");
  assert.match(message, /SMTP authentication failed/);
  assert.match(message, /EMAIL_USER and EMAIL_PASSWORD/);
  assert.doesNotMatch(message, /never-log-this-password/);
});

test("logs sanitized SMTP response and safe error metadata", () => {
  const previousPassword = process.env.EMAIL_PASSWORD;
  const previousJwtSecret = process.env.JWT_SECRET;
  process.env.EMAIL_PASSWORD = "never-log-this-password";
  process.env.JWT_SECRET = "never-log-this-jwt-secret";
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    logSmtpFailure("verify", {
      code: "EAUTH",
      responseCode: 535,
      response:
        "535 credentials never-log-this-password jwt never-log-this-jwt-secret",
    });
  } finally {
    console.error = originalError;
    restoreEnvironment("EMAIL_PASSWORD", previousPassword);
    restoreEnvironment("JWT_SECRET", previousJwtSecret);
  }

  const serializedLog = JSON.stringify(logs);
  assert.match(serializedLog, /EAUTH/);
  assert.match(serializedLog, /535/);
  assert.match(serializedLog, /\[REDACTED\]/);
  assert.equal(serializedLog.includes("never-log-this-password"), false);
  assert.equal(serializedLog.includes("never-log-this-jwt-secret"), false);
});

test("development verify failure records every recipient and returns a safe error", async () => {
  const originals = {
    find: User.find,
    create: Notification.create,
    createTransport: nodemailer.createTransport,
    error: console.error,
    nodeEnv: process.env.NODE_ENV,
  };
  const emailOverrides = {
    EMAIL_HOST: "smtp.example.test",
    EMAIL_PORT: "587",
    EMAIL_USER: "sender@example.test",
    EMAIL_PASSWORD: "never-log-this-password",
  };
  const previousEmailEnv = {};
  for (const [name, value] of Object.entries(emailOverrides)) {
    previousEmailEnv[name] = process.env[name];
    process.env[name] = value;
  }
  process.env.NODE_ENV = "development";

  const logs = [];
  const createdNotifications = [];
  let sendMailCalls = 0;
  User.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [{ email: "one@example.test" }, { email: "two@example.test" }];
    },
  });
  Notification.create = async (notification) => {
    createdNotifications.push(notification);
    return { ...notification, _id: "notification-id" };
  };
  nodemailer.createTransport = (config) => {
    assert.equal(config.secure, false);
    assert.equal(config.requireTLS, true);
    return {
      async verify() {
        const error = new Error("Authentication failed");
        error.code = "EAUTH";
        error.responseCode = 535;
        error.response = "535 credentials rejected: never-log-this-password";
        throw error;
      },
      async sendMail() {
        sendMailCalls += 1;
      },
    };
  };
  console.error = (...args) => logs.push(args);

  const response = createResponse();
  try {
    await sendEmail(
      {
        body: { subject: "Test", message: "Test notification" },
        user: { _id: "admin-id" },
      },
      response,
      (error) => {
        throw error;
      }
    );
  } finally {
    User.find = originals.find;
    Notification.create = originals.create;
    nodemailer.createTransport = originals.createTransport;
    console.error = originals.error;
    restoreEnvironment("NODE_ENV", originals.nodeEnv);
    for (const [name, value] of Object.entries(previousEmailEnv)) {
      restoreEnvironment(name, value);
    }
  }

  assert.equal(response.statusCode, 502);
  assert.match(response.body.message, /SMTP authentication failed/);
  assert.equal(response.body.result.failedCount, 2);
  assert.equal(response.body.result.deliveryStatus, "failed");
  assert.equal(sendMailCalls, 0);
  assert.equal(createdNotifications.length, 1);
  assert.equal(createdNotifications[0].recipientCount, 2);
  assert.equal(createdNotifications[0].failedCount, 2);
  assert.equal(JSON.stringify(logs).includes(emailOverrides.EMAIL_PASSWORD), false);
  assert.equal(JSON.stringify(response.body).includes(emailOverrides.EMAIL_PASSWORD), false);
});

function withEmailEnvironment(overrides, callback) {
  const names = [
    "EMAIL_HOST",
    "EMAIL_PORT",
    "EMAIL_SECURE",
    "EMAIL_USER",
    "EMAIL_PASSWORD",
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    EMAIL_HOST: "smtp.example.test",
    EMAIL_PORT: "465",
    EMAIL_SECURE: "false",
    EMAIL_USER: "sender@example.test",
    EMAIL_PASSWORD: "test-password",
    ...overrides,
  });
  try {
    callback();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      restoreEnvironment(name, value);
    }
  }
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
