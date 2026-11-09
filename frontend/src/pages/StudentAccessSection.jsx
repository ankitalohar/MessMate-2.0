import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client.js";

const EMPTY_FORM = {
  rollNumber: "",
  universityRegistrationNumber: "",
  fullName: "",
  email: "",
};

function studentPayload(student) {
  return {
    rollNumber: student.rollNumber,
    universityRegistrationNumber: student.universityRegistrationNumber,
    fullName: student.fullName,
    email: student.email || "",
  };
}

export default function StudentAccessSection({ onMessage }) {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ status, search });
      const result = await apiRequest(`/admin/student-access?${query}`);
      setStudents(result.students);
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      setLoading(false);
    }
  }, [onMessage, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(loadStudents, 200);
    return () => window.clearTimeout(timer);
  }, [loadStudents]);

  function startEdit(student) {
    setEditing(student._id);
    setShowAddForm(true);
    setForm(studentPayload(student));
  }

  function closeForm() {
    setShowAddForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function saveStudent(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const edit = Boolean(editing);
      const path = edit ? `/admin/student-access/${editing}` : "/admin/student-access";
      const response = await apiRequest(path, {
        method: edit ? "PATCH" : "POST",
        body: { ...form, ...(edit ? { action: "edit" } : {}) },
      });
      onMessage({ text: response.message, error: false });
      closeForm();
      await loadStudents();
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function updateRequest(student, decision) {
    setBusy(true);
    try {
      const response = await apiRequest(`/admin/student-access/${student._id}/review`, {
        method: "PATCH",
        body: { status: decision },
      });
      onMessage({ text: response.message, error: false });
      await loadStudents();
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function setActive(student, active) {
    setBusy(true);
    try {
      const response = await apiRequest(`/admin/student-access/${student._id}`, {
        method: "PATCH",
        body: { action: active ? "reactivate" : "deactivate" },
      });
      onMessage({ text: response.message, error: false });
      await loadStudents();
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  const approved = students.filter((student) => student.status === "APPROVED" || student.status === "DEACTIVATED");
  const pending = students.filter((student) => student.status === "PENDING");
  const rejected = students.filter((student) => student.status === "REJECTED");

  return (
    <section className="admin-section student-access-section">
      <div className="panel access-toolbar">
        <div className="panel-heading">
          <div><p className="eyebrow">STUDENT AUTHORIZATION</p><h2>Manage Student Access</h2><p>Only approved identities may register or use student accounts.</p></div>
          <button className="button button-primary" type="button" onClick={() => { closeForm(); setShowAddForm(true); }}>Add Student</button>
        </div>
        <div className="filter-bar">
          <input aria-label="Search student access records" placeholder="Search roll number, registration number, name, or email" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Filter student access status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING">Pending</option>
            <option value="REJECTED">Rejected</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>
        </div>
      </div>

      {showAddForm && (
        <form className="panel student-access-form" onSubmit={saveStudent}>
          <div className="panel-heading"><div><p className="eyebrow">{editing ? "EDIT AUTHORIZED IDENTITY" : "AUTHORIZE A STUDENT"}</p><h3>{editing ? "Edit student details" : "Add Student"}</h3></div></div>
          <label>Student Roll Number<input required maxLength="30" value={form.rollNumber} onChange={(event) => setForm({ ...form, rollNumber: event.target.value.toUpperCase() })} /></label>
          <label>University Registration Number<input required maxLength="40" value={form.universityRegistrationNumber} onChange={(event) => setForm({ ...form, universityRegistrationNumber: event.target.value.toUpperCase() })} /></label>
          <label>Full Name<input required minLength="2" maxLength="100" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
          <label>GIET Email Address<input required type="email" maxLength="254" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value.toLowerCase() })} /></label>
          <div className="button-row">
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add approved student"}</button>
            <button className="button button-outline" type="button" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? <div className="loading-line" role="status">Loading student access records…</div> : (
        <>
          <AccessTable
            title="Approved Students"
            eyebrow="APPROVED"
            students={approved}
            columns={["Roll Number", "University Registration Number", "Full Name", "Registered Email", "Account Status", "Registration Date"]}
            busy={busy}
            renderRow={(student) => (
              <>
                <td>{student.rollNumber}</td><td>{student.universityRegistrationNumber}</td><td>{student.fullName}</td>
                <td>{student.account?.email || student.email || "Not registered"}</td>
                <td>{student.status === "DEACTIVATED" || student.account && !student.account.isActive ? "Deactivated" : student.account ? "Active" : "Not registered"}</td>
                <td>{student.account?.createdAt ? new Date(student.account.createdAt).toLocaleDateString() : "—"}</td>
                <td><button className="table-action" type="button" disabled={busy} onClick={() => startEdit(student)}>Edit</button>
                  {student.status === "DEACTIVATED" || student.account && !student.account.isActive
                    ? <button className="table-action" type="button" disabled={busy} onClick={() => setActive(student, true)}>Reactivate</button>
                    : <button className="table-action" type="button" disabled={busy || student.status !== "APPROVED"} onClick={() => setActive(student, false)}>Deactivate</button>}
                </td>
              </>
            )}
          />
          <AccessTable
            title="Pending Access Requests"
            eyebrow="AWAITING ADMIN REVIEW"
            students={pending}
            columns={["Roll Number", "University Registration Number", "Full Name", "GIET Email", "Request Date", "Approval Status"]}
            busy={busy}
            renderRow={(student) => (
              <>
                <td>{student.rollNumber}</td><td>{student.universityRegistrationNumber}</td><td>{student.fullName}</td><td>{student.email}</td>
                <td>{student.requestedAt ? new Date(student.requestedAt).toLocaleString() : new Date(student.createdAt).toLocaleString()}</td><td>{student.status}</td>
                <td><button className="table-action" type="button" disabled={busy} onClick={() => updateRequest(student, "APPROVED")}>Approve</button>
                  <button className="table-action" type="button" disabled={busy} onClick={() => updateRequest(student, "REJECTED")}>Reject</button></td>
              </>
            )}
          />
          <AccessTable
            title="Rejected Requests"
            eyebrow="REJECTED"
            students={rejected}
            columns={["Roll Number", "University Registration Number", "Full Name", "GIET Email", "Request Date", "Approval Status"]}
            busy={busy}
            renderRow={(student) => (
              <>
                <td>{student.rollNumber}</td><td>{student.universityRegistrationNumber}</td><td>{student.fullName}</td><td>{student.email}</td>
                <td>{student.requestedAt ? new Date(student.requestedAt).toLocaleString() : new Date(student.createdAt).toLocaleString()}</td><td>{student.status}</td>
              </>
            )}
          />
        </>
      )}
    </section>
  );
}

function AccessTable({ title, eyebrow, students, columns, renderRow }) {
  return (
    <section className="panel access-table-panel">
      <div className="panel-heading"><div><p className="eyebrow">{eyebrow}</p><h3>{title} <small>({students.length})</small></h3></div></div>
      <div className="report-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}<th>Actions</th></tr></thead>
        <tbody>{students.map((student) => <tr key={student._id}>{renderRow(student)}</tr>)}
          {!students.length && <tr><td className="empty-row" colSpan={columns.length + 1}>No records in this category.</td></tr>}
        </tbody>
      </table></div>
    </section>
  );
}
