const assert = require("node:assert/strict");
const test = require("node:test");
const Feedback = require("../backend/models/Feedback");
const {
  getAdminFeedback,
  getStudentFeedback,
  markFeedbackReviewed,
  saveFeedback,
} = require("../backend/controllers/feedbackController");

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

test("rejects invalid feedback before attempting a database write", async () => {
  const original = Feedback.findOneAndUpdate;
  let writes = 0;
  Feedback.findOneAndUpdate = async () => { writes += 1; };
  try {
    const response = createResponse();
    await saveFeedback({
      user: { _id: "student-id" },
      body: { date: "2026-10-12", meal: "lunch", rating: 6, feedback: "Good" },
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 400);
    assert.equal(writes, 0);
  } finally {
    Feedback.findOneAndUpdate = original;
  }
});

test("saves feedback against the authenticated student and sends no duplicate update notification", async () => {
  const original = Feedback.findOneAndUpdate;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  let filter;
  let options;
  Feedback.findOneAndUpdate = async (savedFilter, _update, savedOptions) => {
    filter = savedFilter;
    options = savedOptions;
    return {
      lastErrorObject: { updatedExisting: false },
      value: {
        _id: "feedback-id",
        studentId: savedFilter.studentId,
        date: savedFilter.date,
        meal: savedFilter.meal,
        rating: 5,
        feedback: "Great",
      },
    };
  };
  try {
    const response = createResponse();
    await saveFeedback({
      user: { _id: "authenticated-student", name: "Student" },
      body: { date: "2026-10-12", meal: "lunch", rating: 5, feedback: " Great " },
    }, response, (error) => { throw error; });
    assert.deepEqual(filter, {
      studentId: "authenticated-student",
      date: "2026-10-12",
      meal: "lunch",
    });
    assert.equal(options.includeResultMetadata, true);
    assert.equal(response.body.updated, false);
    assert.equal(response.body.emailStatus, "skipped");
    assert.equal(response.body.feedback.feedback, "Great");
  } finally {
    Feedback.findOneAndUpdate = original;
    restoreEnvironment("NODE_ENV", previousNodeEnv);
  }
});

test("student feedback reads are restricted to their authenticated identity", async () => {
  const original = Feedback.find;
  let filter;
  Feedback.find = (query) => {
    filter = query;
    return {
      sort() { return this; },
      lean: async () => [],
    };
  };
  try {
    const response = createResponse();
    await getStudentFeedback({
      user: { _id: "authenticated-student" },
      query: { date: "2026-10-12", meal: "lunch" },
    }, response, (error) => { throw error; });
    assert.deepEqual(filter, {
      studentId: "authenticated-student",
      date: "2026-10-12",
      meal: "lunch",
    });
    assert.deepEqual(response.body.feedback, []);
  } finally {
    Feedback.find = original;
  }
});

test("admin feedback applies validated filters and calculates ratings", async () => {
  const originals = {
    find: Feedback.find,
    countDocuments: Feedback.countDocuments,
    aggregate: Feedback.aggregate,
  };
  let query;
  Feedback.find = (filter) => {
    query = filter;
    return {
      populate() { return this; },
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      lean: async () => [{ _id: "feedback-1", rating: 2 }],
    };
  };
  Feedback.countDocuments = async () => 1;
  Feedback.aggregate = async () => [
    { _id: "lunch", averageRating: 2, reviewCount: 1, lowRatingCount: 1 },
  ];
  try {
    const response = createResponse();
    await getAdminFeedback({
      query: { from: "2026-10-01", to: "2026-10-31", meal: "lunch", rating: "2", search: "too salty" },
    }, response, (error) => { throw error; });
    assert.deepEqual(query, {
      date: { $gte: "2026-10-01", $lte: "2026-10-31" },
      meal: "lunch",
      rating: 2,
      feedback: { $regex: "too salty", $options: "i" },
    });
    assert.equal(response.body.averageRating, 2);
    assert.equal(response.body.reviewCount, 1);
    assert.equal(response.body.mealSummaries.lunch.lowRatingCount, 1);
  } finally {
    Feedback.find = originals.find;
    Feedback.countDocuments = originals.countDocuments;
    Feedback.aggregate = originals.aggregate;
  }
});

test("admin can mark feedback reviewed without deleting the record", async () => {
  const original = Feedback.findByIdAndUpdate;
  let update;
  Feedback.findByIdAndUpdate = async (_id, changes) => {
    update = changes;
    return { _id, reviewed: true };
  };
  try {
    const response = createResponse();
    await markFeedbackReviewed({
      params: { id: "507f1f77bcf86cd799439011" },
      body: { reviewed: true },
      user: { _id: "admin-id" },
    }, response, (error) => { throw error; });
    assert.equal(update.$set.reviewed, true);
    assert.equal(update.$set.reviewedBy, "admin-id");
    assert.equal(response.body.feedback.reviewed, true);
  } finally {
    Feedback.findByIdAndUpdate = original;
  }
});

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
