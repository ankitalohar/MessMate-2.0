const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../backend/models/User");
const StudentAuthorization = require("../backend/models/StudentAuthorization");
const { login } = require("../backend/controllers/authController");
const {
  findAuthorizationForAccount,
  matchesStudentIdentity,
} = require("../backend/utils/studentIdentity");

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

test("links a legacy student account by its registered email and normalized name", async () => {
  const account = {
    _id: "student-account-id",
    name: " Ankita   Lohar ",
    email: "24cse301.ankitalohar@giet.edu",
    role: "student",
    isActive: true,
    password: "existing-password-hash",
    rollNumber: undefined,
    universityRegistrationNumber: undefined,
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
    },
  };
  const approvedIdentity = {
    rollNumber: "24CSE301",
    universityRegistrationNumber: "24UG010363",
    fullName: "ANKITA LOHAR",
    email: "24cse301.ankitalohar@giet.edu",
    status: "APPROVED",
  };
  const originals = {
    userFindOne: User.findOne,
    authorizationFindOne: StudentAuthorization.findOne,
    compare: bcrypt.compare,
    jwtSecret: process.env.JWT_SECRET,
  };
  User.findOne = () => ({ select: async () => account });
  StudentAuthorization.findOne = async (filter) =>
    filter.email === account.email ? approvedIdentity : null;
  bcrypt.compare = async (password, hash) =>
    password === "correct-password" && hash === "existing-password-hash";
  process.env.JWT_SECRET = "test-student-auth-secret-at-least-32-characters";

  try {
    const res = createResponse();
    await login({
      body: {
        email: account.email,
        password: "correct-password",
        role: "student",
      },
    }, res, (error) => { throw error; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.role, "student");
    assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).sub, account._id);
    assert.equal(account.rollNumber, "24CSE301");
    assert.equal(account.universityRegistrationNumber, "24UG010363");
    assert.equal(account.saveCalls, 1);
    assert.equal(account.password, "existing-password-hash");
  } finally {
    User.findOne = originals.userFindOne;
    StudentAuthorization.findOne = originals.authorizationFindOne;
    bcrypt.compare = originals.compare;
    restore("JWT_SECRET", originals.jwtSecret);
  }
});

test("does not link a legacy user when the authorization email or normalized name differs", async () => {
  const account = {
    name: "Ankita Lohar",
    email: "student@giet.edu",
  };
  const original = StudentAuthorization.findOne;
  StudentAuthorization.findOne = async () => ({
    rollNumber: "24CSE301",
    universityRegistrationNumber: "24UG010363",
    fullName: "OTHER STUDENT",
    email: "different@giet.edu",
    status: "APPROVED",
  });
  try {
    assert.equal(
      await findAuthorizationForAccount(StudentAuthorization, account),
      null
    );
    assert.equal(
      matchesStudentIdentity(
        { rollNumber: "24CSE301", universityRegistrationNumber: "24UG010363" },
        " 24cse301 ",
        "24ug010363 "
      ),
      true
    );
    assert.equal(
      matchesStudentIdentity(
        { rollNumber: "24CSE301", universityRegistrationNumber: "24UG010363" },
        "24CSE301",
        "24UG010364"
      ),
      false
    );
  } finally {
    StudentAuthorization.findOne = original;
  }
});

for (const [status, code, message] of [
  ["PENDING", "STUDENT_PENDING", /pending admin approval/i],
  ["REJECTED", "STUDENT_REJECTED", /rejected/i],
  ["DEACTIVATED", "STUDENT_DEACTIVATED", /deactivated/i],
]) {
  test(`blocks login for ${status.toLowerCase()} legacy identity`, async () => {
    const account = {
      _id: "student-account-id",
      name: "Ankita Lohar",
      email: "24cse301.ankitalohar@giet.edu",
      role: "student",
      isActive: true,
      password: "existing-password-hash",
    };
    const originals = {
      userFindOne: User.findOne,
      authorizationFindOne: StudentAuthorization.findOne,
    };
    User.findOne = () => ({ select: async () => account });
    StudentAuthorization.findOne = async () => ({
      rollNumber: "24CSE301",
      universityRegistrationNumber: "24UG010363",
      fullName: "ANKITA LOHAR",
      email: account.email,
      status,
    });
    try {
      const res = createResponse();
      await login({
        body: { email: account.email, password: "password", role: "student" },
      }, res, (error) => { throw error; });
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.code, code);
      assert.match(res.body.message, message);
    } finally {
      User.findOne = originals.userFindOne;
      StudentAuthorization.findOne = originals.authorizationFindOne;
    }
  });
}

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
