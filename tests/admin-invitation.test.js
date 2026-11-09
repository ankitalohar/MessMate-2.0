const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../backend/models/User");
const { register } = require("../backend/controllers/authController");

const configuredKeyForTests = "test-only-admin-invitation-key";

test("admin registration rejects a missing invitation key", async () => {
  const { response, createdUsers } = await registerWithUserStore({
    adminRegistrationKey: undefined,
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    success: false,
    message: "A valid admin invitation key is required.",
  });
  assert.equal(createdUsers.length, 0);
});

test("admin registration rejects an incorrect invitation key", async () => {
  const { response, createdUsers } = await registerWithUserStore({
    adminRegistrationKey: "wrong-key",
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    success: false,
    message: "Invalid admin invitation key.",
  });
  assert.equal(createdUsers.length, 0);
});

test("admin registration accepts the configured key without storing or returning it", async () => {
  const { response, createdUsers } = await registerWithUserStore({
    adminRegistrationKey: `  ${configuredKeyForTests}  `,
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, "Registration successful!");
  assert.equal(response.body.user.role, "admin");
  assert.equal("adminRegistrationKey" in createdUsers[0], false);
  assert.equal(JSON.stringify(response.body).includes(configuredKeyForTests), false);
});

test("student registration does not require or store an invitation key", async () => {
  const { response, createdUsers } = await registerWithUserStore({
    role: "student",
    email: "student@giet.edu",
    adminRegistrationKey: undefined,
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.user.role, "student");
  assert.equal("adminRegistrationKey" in createdUsers[0], false);
});

test("student registration still rejects non-GIET addresses", async () => {
  const { response, createdUsers } = await registerWithUserStore({
    role: "student",
    email: "student@gmail.com",
    adminRegistrationKey: undefined,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    success: false,
    message: "Only GIET student email addresses ending with @giet.edu are allowed.",
  });
  assert.equal(createdUsers.length, 0);
});

async function registerWithUserStore(overrides) {
  const previous = {
    exists: User.exists,
    create: User.create,
    jwtSecret: process.env.JWT_SECRET,
    adminRegistrationKey: process.env.ADMIN_REGISTRATION_KEY,
  };
  const createdUsers = [];
  process.env.JWT_SECRET = "test-only-jwt-secret-long-enough-for-signing";
  process.env.ADMIN_REGISTRATION_KEY = configuredKeyForTests;
  User.exists = async () => false;
  User.create = async (user) => {
    createdUsers.push(user);
    return { ...user, _id: { toString: () => "test-user-id" } };
  };

  const response = createResponse();
  try {
    await register(
      {
        body: {
          name: "Test Account",
          email: "admin@example.com",
          mobile: "1234567890",
          password: "test-password-123",
          confirmPassword: "test-password-123",
          role: "admin",
          hostel: "",
          room: "",
          ...overrides,
        },
      },
      response,
      (error) => {
        throw error;
      }
    );
  } finally {
    User.exists = previous.exists;
    User.create = previous.create;
    restoreEnvironment("JWT_SECRET", previous.jwtSecret);
    restoreEnvironment("ADMIN_REGISTRATION_KEY", previous.adminRegistrationKey);
  }

  return { response, createdUsers };
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

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
