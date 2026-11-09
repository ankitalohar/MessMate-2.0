const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../backend/models/User");
const StudentAuthorization = require("../backend/models/StudentAuthorization");
const { login, register } = require("../backend/controllers/authController");
const {
  isGietStudentEmail,
  isValidEmailFormat,
  normalizeEmail,
} = require("../backend/utils/email");

test("accepts valid GIET addresses after normalizing their case", () => {
  for (const email of [
    "123456@giet.edu",
    "studentname@giet.edu",
    "ankita@Giet.edu",
  ]) {
    const normalizedEmail = normalizeEmail(email);
    assert.equal(isValidEmailFormat(normalizedEmail), true, email);
    assert.equal(isGietStudentEmail(normalizedEmail), true, email);
  }
});

test("frontend checks the student suffix and full email format", async () => {
  const {
    hasGietStudentEmailDomain,
    isValidEmailFormat: isFrontendEmailValid,
    normalizeEmail: normalizeFrontendEmail,
  } = await import("../frontend/src/auth/email.js");
  const email = normalizeFrontendEmail("ankita@Giet.edu");

  assert.equal(email, "ankita@giet.edu");
  assert.equal(hasGietStudentEmailDomain(email), true);
  assert.equal(isFrontendEmailValid(email), true);
  assert.equal(hasGietStudentEmailDomain("ankita@giet.edu.fake"), false);
  assert.equal(hasGietStudentEmailDomain(""), false);
  assert.equal(isFrontendEmailValid("ankita@@giet.edu"), false);
});

test("rejects non-GIET domains, empty email, and malformed addresses", () => {
  for (const email of [
    "student@gmail.com",
    "student@yahoo.com",
    "student@giet.ac.in",
    "student@giet.edu.in",
    "ankita@giet.edu.fake",
    "",
    "not-an-email",
    "ankita@@giet.edu",
  ]) {
    const normalizedEmail = normalizeEmail(email);
    assert.equal(
      isValidEmailFormat(normalizedEmail) && isGietStudentEmail(normalizedEmail),
      false,
      email
    );
  }
});

test("Mongoose requires GIET email for students but not administrators", () => {
  const student = new User({
    name: "GIET Student",
    email: "ankita@Giet.edu",
    mobile: "1234567890",
    password: "hashed-password",
    role: "student",
  });
  assert.equal(student.email, "ankita@giet.edu");
  assert.equal(student.validateSync(), undefined);

  student.email = "ankita@gmail.com";
  assert.equal(
    student.validateSync().errors.email.message,
    "Student email addresses must end with @giet.edu."
  );

  const admin = new User({
    name: "MessMate Admin",
    email: "admin@gmail.com",
    mobile: "1234567890",
    password: "hashed-password",
    role: "admin",
  });
  assert.equal(admin.validateSync(), undefined);
});

test("student registration rejects non-GIET email before database creation", async () => {
  const response = createResponse();
  await register(
    { body: { role: "student", email: "ankita@gmail.com" } },
    response,
    assert.fail
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    success: false,
    message: "Only GIET student email addresses ending with @giet.edu are allowed.",
  });
});

test("student registration accepts case and whitespace variants but stores the approved name", async () => {
  const enteredNames = [
    "ANKITA LOHAR",
    "ankita lohar",
    "Ankita Lohar",
    "AnKiTa LoHaR",
    "  Ankita   Lohar  ",
  ];
  const originals = {
    authorizationFind: StudentAuthorization.find,
    userFind: User.find,
    userExists: User.exists,
    userCreate: User.create,
    jwtSecret: process.env.JWT_SECRET,
  };
  const authorization = {
    rollNumber: "24CSE301",
    universityRegistrationNumber: "24UG010363",
    fullName: "ANKITA LOHAR",
    status: "APPROVED",
    async save() {},
  };
  const createdUsers = [];
  StudentAuthorization.find = () => ({ limit: async () => [authorization] });
  User.find = () => ({ limit: async () => [] });
  User.exists = async () => false;
  User.create = async (user) => {
    createdUsers.push(user);
    return { ...user, _id: { toString: () => "student-id" } };
  };
  process.env.JWT_SECRET = "test-student-registration-secret-long-enough";

  try {
    for (const [index, name] of enteredNames.entries()) {
      authorization.email = undefined;
      const response = createResponse();
      await register({
        body: {
          name,
          email: "ankita@giet.edu",
          mobile: "1234567890",
          password: "test-password-123",
          confirmPassword: "test-password-123",
          role: "student",
          rollNumber: "24CSE301",
          universityRegistrationNumber: "24UG010363",
        },
      }, response, (error) => { throw error; });

      assert.equal(response.statusCode, 201, name);
      assert.equal(createdUsers[index].name, authorization.fullName);
      assert.equal(authorization.fullName, "ANKITA LOHAR");
    }
  } finally {
    StudentAuthorization.find = originals.authorizationFind;
    User.find = originals.userFind;
    User.exists = originals.userExists;
    User.create = originals.userCreate;
    restoreEnvironment("JWT_SECRET", originals.jwtSecret);
  }
});

test("student registration still rejects a genuinely incorrect name", async () => {
  const originals = {
    authorizationFind: StudentAuthorization.find,
    userFind: User.find,
    userExists: User.exists,
    userCreate: User.create,
    jwtSecret: process.env.JWT_SECRET,
  };
  let created = false;
  StudentAuthorization.find = () => ({ limit: async () => [{
    rollNumber: "24CSE301",
    universityRegistrationNumber: "24UG010363",
    fullName: "ANKITA LOHAR",
    status: "APPROVED",
  }] });
  User.find = () => ({ limit: async () => [] });
  User.exists = async () => false;
  User.create = async () => { created = true; };
  process.env.JWT_SECRET = "test-student-registration-secret-long-enough";

  try {
    const response = createResponse();
    await register({
      body: {
        name: "Ankita Sahoo",
        email: "ankita@giet.edu",
        mobile: "1234567890",
        password: "test-password-123",
        confirmPassword: "test-password-123",
        role: "student",
        rollNumber: "24CSE301",
        universityRegistrationNumber: "24UG010363",
      },
    }, response, (error) => { throw error; });

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, "STUDENT_IDENTITY_MISMATCH");
    assert.equal(created, false);
  } finally {
    StudentAuthorization.find = originals.authorizationFind;
    User.find = originals.userFind;
    User.exists = originals.userExists;
    User.create = originals.userCreate;
    restoreEnvironment("JWT_SECRET", originals.jwtSecret);
  }
});

test("student login rejects non-GIET email without authenticating", async () => {
  const response = createResponse();
  await login(
    { body: { role: "student", email: "ankita@gmail.com", password: "password" } },
    response,
    assert.fail
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    success: false,
    message: "Student login is only available for GIET email addresses ending with @giet.edu.",
  });
});

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
