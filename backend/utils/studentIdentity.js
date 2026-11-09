function normalizeStudentId(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeStudentName(value) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toUpperCase()
    : "";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findAuthorizationCandidates(Model, rollNumber, universityRegistrationNumber) {
  const roll = normalizeStudentId(rollNumber);
  const registration = normalizeStudentId(universityRegistrationNumber);
  if (!roll || !registration) return [];
  return Model.find({
    $or: [
      { rollNumber: new RegExp(`^\\s*${escapeRegex(roll)}\\s*$`, "i") },
      {
        universityRegistrationNumber: new RegExp(
          `^\\s*${escapeRegex(registration)}\\s*$`,
          "i"
        ),
      },
    ],
  }).limit(10);
}

function matchesStudentIdentity(student, rollNumber, universityRegistrationNumber) {
  return (
    normalizeStudentId(student.rollNumber) === normalizeStudentId(rollNumber) &&
    normalizeStudentId(student.universityRegistrationNumber) ===
      normalizeStudentId(universityRegistrationNumber)
  );
}

async function findAuthorizationForAccount(Model, account) {
  const rollNumber = normalizeStudentId(account.rollNumber);
  const universityRegistrationNumber = normalizeStudentId(
    account.universityRegistrationNumber
  );
  if (rollNumber && universityRegistrationNumber) {
    const candidates = await findAuthorizationCandidates(
      Model,
      rollNumber,
      universityRegistrationNumber
    );
    return candidates.find((candidate) =>
      matchesStudentIdentity(candidate, rollNumber, universityRegistrationNumber)
    ) || null;
  }

  const email = typeof account.email === "string" ? account.email.trim().toLowerCase() : "";
  if (!email) return null;
  const authorization = await Model.findOne({ email });
  if (!authorization) return null;

  if (
    (rollNumber && normalizeStudentId(authorization.rollNumber) !== rollNumber) ||
    (universityRegistrationNumber &&
      normalizeStudentId(authorization.universityRegistrationNumber) !==
        universityRegistrationNumber) ||
    normalizeStudentName(authorization.fullName) !== normalizeStudentName(account.name) ||
    typeof authorization.email !== "string" ||
    authorization.email.trim().toLowerCase() !== email
  ) {
    return null;
  }
  return authorization;
}

module.exports = {
  findAuthorizationForAccount,
  findAuthorizationCandidates,
  matchesStudentIdentity,
  normalizeStudentId,
  normalizeStudentName,
};
