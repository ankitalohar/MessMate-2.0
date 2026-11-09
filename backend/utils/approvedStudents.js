const StudentAuthorization = require("../models/StudentAuthorization");
const {
  findAuthorizationCandidates,
  matchesStudentIdentity,
  normalizeStudentName,
} = require("./studentIdentity");

const approvedStudents = [
  ["24CSE242", "24UG010306", "ABHIJIT BARIK"],
  ["24CSE245", "24UG010309", "SANDEEP ROUT"],
  ["24CSE249", "24UG010312", "SAMBIT KUMAR SAHOO"],
  ["24CSE252", "24UG010315", "PRIYANSU JENA"],
  ["24CSE256", "24UG010318", "SHIVANSHU VERMA"],
  ["24CSE262", "24UG010324", "ALISHA NATH"],
  ["24CSE271", "24UG010333", "MANMEET NATUA"],
  ["24CSE274", "24UG010336", "ANUJ KUMAR"],
  ["24CSE277", "24UG010339", "JYOSHNA CHOUDHURY"],
  ["24CSE280", "24UG010342", "VISHAKHA JAISWAL"],
  ["24CSE283", "24UG010345", "SAIRAM SAHU"],
  ["24CSE286", "24UG010348", "ARATI PATRA"],
  ["24CSE289", "24UG010351", "DINESH ANAND BEHERA"],
  ["24CSE292", "24UG010354", "ANKIT PATI"],
  ["24CSE298", "24UG010360", "KHUSHI KUMARI"],
  ["24CSE301", "24UG010363", "ANKITA LOHAR"],
  ["24CSE305", "24UG010366", "SILPA PRADHAN"],
  ["24CSE309", "24UG010369", "PRATYUSH PRIYABRATA SAMAL"],
  ["24CSE312", "24UG010372", "ABHISHEK SAMAL"],
  ["24CSE315", "24UG010375", "SUJAL NAHAK"],
  ["24CSE318", "24UG010378", "ANKITA SAHOO"],
  ["24CSE321", "24UG010381", "SURU NILAKANTHA SHIVA SAI"],
  ["24CSE324", "24UG010384", "ANIKET MISHRA"],
  ["24CSE327", "24UG010387", "SARATHI SABAR"],
  ["24CSE330", "24UG010390", "RAM KUMAR"],
  ["24CSE333", "24UG010393", "ANKITA DAS"],
  ["24CSE338", "24UG010397", "KHUSHI RANI SARKAR"],
  ["24CSE341", "24UG010400", "PARSHURAM BISWAL"],
  ["24CSE344", "24UG010403", "TRILOCHAN MOHANTY"],
  ["24CSE347", "24UG010406", "AKANKHYA KHADANGA"],
  ["24CSE350", "24UG010409", "SUVAM KAR"],
  ["24CSE353", "24UG010412", "AMISHA CHAUHAN"],
  ["24CSE358", "24UG010415", "AASHISH GUPTA"],
  ["24CSE361", "24UG010418", "PREETISH RANJAN"],
  ["24CSE364", "24UG010421", "AMAN KUMAR"],
  ["24CSE367", "24UG010424", "DEBA PRASAD SAHOO"],
  ["24CSE370", "24UG010427", "ARUSHI PATRA"],
  ["24CSE373", "24UG010430", "PARTHA SARATHI NAYAK"],
  ["24CSE376", "24UG010433", "MD ARSHYAN AHMAD"],
  ["24CSE379", "24UG010436", "PRATEEK KUMAR PANDA"],
  ["24CSE382", "24UG010439", "SRISHTI SHREYA"],
  ["24CSE385", "24UG010442", "ASHWIN KUMAR PANIGRAHY"],
  ["24CSE388", "24UG010445", "TANISHA SHARMA"],
  ["24CSE391", "24UG010448", "DEBASIS BEHERA"],
  ["24CSE394", "24UG010451", "PANKAJ KUMAR MAHTO"],
  ["24CSE397", "24UG010454", "SOUMYARANJAN ROUT"],
  ["24CSE400", "24UG010457", "SUBHA PRADEEP SAHU"],
  ["24CSE403", "24UG010460", "ADITYA NARAYAN BARIK"],
  ["24CSE406", "24UG010463", "SANDEEP KHATAI"],
  ["24CSE410", "24UG010467", "MANAS KUMAR SAHOO"],
  ["24CSE413", "24UG010470", "SUMAN BEHERA"],
  ["24CSE421", "24UG010477", "SELINA PRADHAN"],
  ["24CSE424", "24UG010480", "AMAN GUPTA"],
  ["24CSE428", "24UG010483", "MIRTUNJAY KUMAR VERMA"],
  ["24CSE432", "24UG010487", "DEBASMITA PRADHAN"],
  ["24CSE435", "24UG010490", "AKANKHYA SAMAL"],
  ["24CSE438", "24UG010493", "ABHISHEK KUMAR SINGH"],
  ["24CSE441", "24UG010496", "AVINASH KUMAR SINGH"],
  ["24CSE444", "24UG011094", "SUSHIL DAS THARU"],
];

async function seedApprovedStudents() {
  let inserted = 0;
  let reconciled = 0;
  for (const [rollNumber, universityRegistrationNumber, fullName] of approvedStudents) {
    const candidates = await findAuthorizationCandidates(
      StudentAuthorization,
      rollNumber,
      universityRegistrationNumber
    );
    const student = candidates.find((candidate) =>
      matchesStudentIdentity(candidate, rollNumber, universityRegistrationNumber)
    );
    if (!student && candidates.length) continue;
    if (!student) {
      try {
        await StudentAuthorization.create({
          rollNumber,
          universityRegistrationNumber,
          fullName,
          status: "APPROVED",
          statusSource: "INITIAL_ROSTER",
        });
        inserted += 1;
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
      continue;
    }
    if (normalizeStudentName(student.fullName) !== fullName) continue;

    const explicitlyRejected =
      String(student.status).toUpperCase() === "REJECTED" &&
      (student.statusSource === "ADMIN" || Boolean(student.reviewedBy));
    if (
      String(student.status).toUpperCase() !== "DEACTIVATED" &&
      !explicitlyRejected &&
      String(student.status).toUpperCase() !== "APPROVED"
    ) {
      student.status = "APPROVED";
      student.statusSource = "INITIAL_ROSTER";
      await student.save();
      reconciled += 1;
    } else if (String(student.status).toUpperCase() === "APPROVED" && !student.statusSource) {
      student.statusSource = "INITIAL_ROSTER";
      await student.save();
    }
  }
  return {
    inserted,
    alreadyPresent: approvedStudents.length - inserted,
    reconciled,
    total: approvedStudents.length,
  };
}

module.exports = { approvedStudents, seedApprovedStudents };
