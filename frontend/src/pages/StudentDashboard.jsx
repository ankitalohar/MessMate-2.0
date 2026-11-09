import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import MealCard from "../components/MealCard.jsx";
import { apiRequest } from "../api/client.js";
import { QRCodeSVG } from "qrcode.react";

const mealNames = ["breakfast", "lunch", "teaTime", "dinner"];

function emptyPreferences() {
  return Object.fromEntries(
    mealNames.map((mealName) => [
      mealName,
      { status: "not-selected", mealType: null },
    ])
  );
}

function normalizePreferences(meal) {
  return Object.fromEntries(
    mealNames.map((mealName) => [
      mealName,
      {
        status: meal?.[mealName]?.status || "not-selected",
        mealType: meal?.[mealName]?.mealType || null,
      },
    ])
  );
}

function formatDate(dateKey) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

function mealLabel(mealName) {
  if (mealName === "teaTime") return "Tea / Snacks";
  return mealName[0].toUpperCase() + mealName.slice(1);
}

export default function StudentDashboard() {
  const [date, setDate] = useState("");
  const [tomorrowDate, setTomorrowDate] = useState("");
  const [nextSubmissionDate, setNextSubmissionDate] = useState("");
  const [selectionWindowMs, setSelectionWindowMs] = useState(0);
  const [menu, setMenu] = useState(null);
  const [choices, setChoices] = useState(null);
  const [draftChoices, setDraftChoices] = useState(emptyPreferences);
  const [cutoff, setCutoff] = useState("10:00 PM");
  const [timeZone, setTimeZone] = useState("Asia/Kolkata");
  const [cutoffDate, setCutoffDate] = useState("");
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionMessage, setSelectionMessage] = useState("");
  const [mealTimings, setMealTimings] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notice, setNotice] = useState({ text: "", error: false });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async (requestedDate = "") => {
    setLoading(true);
    try {
      const menuPath = requestedDate
        ? `/student/menu?date=${encodeURIComponent(requestedDate)}`
        : "/student/menu";
      const [menuResult, notificationResult] = await Promise.all([
        apiRequest(menuPath),
        apiRequest("/student/notifications"),
      ]);
      const mealResult = await apiRequest(
        `/student/meals?date=${encodeURIComponent(menuResult.date)}`
      );
      setDate(menuResult.date);
      setTomorrowDate(menuResult.tomorrowDate);
      setNextSubmissionDate(menuResult.nextSubmissionDate);
      setSelectionWindowMs(menuResult.selectionWindowMs);
      setMenu(menuResult.menu);
      setCutoff(menuResult.selectionCutoff || "10:00");
      setTimeZone("Asia/Kolkata");
      setCutoffDate(menuResult.cutoffDate);
      setSelectionOpen(menuResult.selectionOpen);
      setSelectionMessage(menuResult.selectionMessage || "");
      setMealTimings(menuResult.mealTimings || {});
      setChoices(mealResult.meal);
      setDraftChoices(normalizePreferences(mealResult.meal));
      setNotifications(notificationResult.notifications);
      setUnreadCount(notificationResult.unreadCount || 0);
      setNotice({ text: "", error: false });
    } catch (error) {
      setNotice({ text: error.message, error: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!selectionOpen) return undefined;
    const timer = window.setTimeout(() => {
      setSelectionOpen(false);
      loadDashboard();
    }, selectionWindowMs);
    return () => window.clearTimeout(timer);
  }, [loadDashboard, selectionOpen, selectionWindowMs]);

  async function saveChoice(mealName, status, mealType) {
    setDraftChoices((previous) => ({
      ...previous,
      [mealName]: {
        status,
        mealType: status === "eat" ? mealType : null,
      },
    }));
    setNotice({ text: "", error: false });
  }

  async function savePreferences(event) {
    event.preventDefault();
    if (!selectionOpen) {
      setNotice({
        text: selectionMessage || "The submission deadline for this meal date has passed.",
        error: true,
      });
      return;
    }
    for (const mealName of mealNames) {
      const choice = draftChoices[mealName];
      const special = menu?.specialMenus?.find((item) => item[mealName]);
      const availableMeal = special ? special[mealName] : menu?.[mealName];
      if (choice.status === "eat" && !["veg", "nonVeg"].includes(choice.mealType)) {
        setNotice({
          text: `Choose a vegetarian or non-vegetarian option for ${mealName}.`,
          error: true,
        });
        return;
      }
      if (
        choice.status === "eat" &&
        !availableMeal?.[choice.mealType]?.length
      ) {
        setNotice({
          text: `That option is not available for ${mealName}.`,
          error: true,
        });
        return;
      }
    }

    setSaving(true);
    try {
      const result = await apiRequest("/student/meals", {
        method: "PUT",
        body: { date, meals: draftChoices },
      });
      setChoices(result.meal);
      setDraftChoices(normalizePreferences(result.meal));
      setNotice({ text: "Your meal preferences have been saved.", error: false });
    } catch (error) {
      setNotice({ text: error.message, error: true });
    } finally {
      setSaving(false);
    }
  }

  const hasUnsavedChanges =
    JSON.stringify(normalizePreferences(choices)) !== JSON.stringify(draftChoices);

  return (
    <div className="app-page">
      <AppHeader />
      <main className="dashboard-wrap">
        <section className="dashboard-heading">
          <div>
            <p className="eyebrow">STUDENT DASHBOARD</p>
            <h1>{date ? `Select Your Meals for ${date === tomorrowDate ? "Tomorrow" : formatDate(date)}` : "Select Your Meals for Tomorrow"}</h1>
            <p className="muted-copy">
              Selected meal date: <strong>{date ? formatDate(date) : "Loading…"}</strong>.
              Your choices help the kitchen prepare the right amount.
            </p>
          </div>
          <div className="meal-date-controls">
            <label className="date-control">
              Meal date
              <input
                type="date"
                value={date}
                max={nextSubmissionDate || undefined}
                disabled={loading || saving}
                onChange={(event) => loadDashboard(event.target.value)}
              />
            </label>
            {date && nextSubmissionDate && date !== nextSubmissionDate && (
              <button
                className="button button-outline"
                type="button"
                disabled={loading || saving}
                onClick={() => loadDashboard(nextSubmissionDate)}
              >
                Next available date
              </button>
            )}
            <span className="date-badge">
              {!date
                ? "Checking submission window…"
                : selectionOpen
                ? `Submit by ${cutoff} IST on ${cutoffDate}`
                : "Read-only · deadline passed"}
            </span>
          </div>
        </section>
        {!selectionOpen && date && (
          <div className="notice notice-error" role="status">
            {selectionMessage}
          </div>
        )}
        {notice.text && (
          <div className={`notice${notice.error ? " notice-error" : " notice-success"}`} role="status">
            {notice.text}
          </div>
        )}
        {!loading && menu?.specialMenus?.length > 0 && <StudentSpecialMenus specials={menu.specialMenus} />}
        {loading ? (
          <div className="loading-panel" role="status">Loading the selected menu and your choices…</div>
        ) : (
          <form onSubmit={savePreferences}>
            <section className="meal-grid" aria-label="Meals for the selected date">
              {mealNames.map((mealName) => {
                const special = menu?.specialMenus?.find((item) => item[mealName]);
                return (
                  <MealCard
                    key={mealName}
                    mealName={mealName}
                    menu={special ? special[mealName] : menu?.[mealName]}
                    choice={draftChoices[mealName]}
                    timing={mealTimings[mealName]}
                    saving={saving || !selectionOpen}
                    onChoose={saveChoice}
                    isSpecial={Boolean(special)}
                  />
                );
              })}
            </section>
            <div className="meal-save-row">
              <p className="meal-save-help">
                {selectionOpen
                  ? "Your saved preferences are shown above. Changes take effect after saving."
                  : "Saved preferences remain available to view after the deadline."}
              </p>
              <button
                className="button button-primary"
                type="submit"
                disabled={saving || !selectionOpen || !hasUnsavedChanges}
              >
                {saving ? "Saving preferences…" : "Save My Meal Preferences"}
              </button>
            </div>
          </form>
        )}
        {!loading && <StudentDiningSection />}
        {!loading && <OfficialMenuReference />}
        {!loading && <StudentNotifications notifications={notifications} />}
        {!loading && <StudentQuickLinks unreadCount={unreadCount} />}
        <p className="privacy-note">Submit next-day meal preferences by 10:00 PM IST on the preceding day.</p>
      </main>
    </div>
  );
}

function StudentSpecialMenus({ specials }) {
  return (
    <section className="student-special-menus" aria-label="Published special menus">
      {specials.map((special) => (
        <article className="student-special-menu" key={special._id}>
          <div className="student-special-heading">
            <span className="special-menu-badge">SPECIAL MENU</span>
            <div><h2>{special.occasionName}</h2><time dateTime={special.date}>{formatDate(special.date)}</time></div>
          </div>
          {special.description && <p>{special.description}</p>}
          <div className="student-special-meals">
            {mealNames.filter((meal) => special[meal]).map((meal) => (
              <div key={meal}>
                <h3>{meal === "teaTime" ? "Tea Time / Snacks" : mealLabel(meal)}</h3>
                {special[meal].veg?.length > 0 && <p><strong>Vegetarian:</strong> {special[meal].veg.join(", ")}</p>}
                {special[meal].nonVeg?.length > 0 && <p><strong>Non-vegetarian:</strong> {special[meal].nonVeg.join(", ")}</p>}
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function StudentDiningSection() {
  const [qr, setQr] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refreshQr = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await apiRequest("/student/dining-qr", { method: "POST", body: {} });
      setQr(result);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadAttendance = useCallback(async () => {
    try {
      const result = await apiRequest("/student/attendance");
      setAttendance(result.attendance || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    refreshQr();
    loadAttendance();
    const timer = window.setInterval(refreshQr, 70000);
    return () => window.clearInterval(timer);
  }, [loadAttendance, refreshQr]);

  return (
    <section className="student-dining-section" aria-labelledby="student-dining-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MESS CHECK-IN</p>
          <h2 id="student-dining-title">My Dining QR</h2>
          <p className="muted-copy">Show this rotating code to authorized mess staff during the meal check-in window.</p>
        </div>
        <button className="button button-outline" type="button" onClick={refreshQr} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh QR"}
        </button>
      </div>
      {error && <div className="notice notice-error" role="status">{error}</div>}
      <div className="student-dining-grid">
        <div className="student-qr-frame" aria-live="polite">
          {qr?.token ? <QRCodeSVG value={qr.token} size={220} level="M" includeMargin /> : <span>Preparing secure QR…</span>}
          {qr?.expiresAt && <small>Refreshes automatically · expires {new Date(qr.expiresAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST</small>}
        </div>
        <div className="student-attendance-history">
          <h3>Attendance history</h3>
          {attendance.length ? (
            <div className="report-table-wrap"><table><thead><tr><th>Date</th><th>Meal</th><th>Status</th><th>Check-in time</th></tr></thead><tbody>
              {attendance.map((record) => <tr key={record._id}><td>{record.date}</td><th>{mealLabel(record.meal)}</th><td>{record.status === "present" ? "Present" : record.status}</td><td>{new Date(record.scannedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST</td></tr>)}
            </tbody></table></div>
          ) : <p className="empty-notifications">No dining check-ins recorded yet.</p>}
        </div>
      </div>
    </section>
  );
}

function OfficialMenuReference() {
  const [imageAvailable, setImageAvailable] = useState(true);
  const imagePath = "/images/giet-central-mess-menu-october-2026.jpg";

  return (
    <section className="official-menu-reference" aria-labelledby="official-menu-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">OFFICIAL REFERENCE</p>
          <h2 id="official-menu-title">Official GIET Central Mess Menu – October 2026</h2>
          <p className="muted-copy">Effective 01 October 2026. The digital daily menu above remains available for accessible meal selection.</p>
        </div>
      </div>
      <div className="official-menu-frame">
        {imageAvailable ? (
          <a
            className="official-menu-image-link"
            href={imagePath}
            target="_blank"
            rel="noopener noreferrer"
            download="giet-central-mess-menu-october-2026.jpg"
            aria-label="Open or download the official October 2026 GIET Central Mess menu image"
          >
            <img
              src={imagePath}
              alt="Official GIET University Central Mess menu for October 2026"
              onError={() => setImageAvailable(false)}
            />
          </a>
        ) : (
          <p className="official-menu-missing">
            The supplied menu image is not in the project yet. Add the original image at
            {" "}
            <code>frontend/public/images/giet-central-mess-menu-october-2026.jpg</code>
            {" "}to display it here.
          </p>
        )}
      </div>
    </section>
  );
}

function StudentNotifications({ notifications }) {
  return (
    <section className="student-notifications">
      <div className="section-heading"><div><p className="eyebrow">MESS UPDATES</p><h2>Notifications</h2></div></div>
      {notifications.length ? notifications.map((item) => (
        <article className="student-notification" key={item._id}>
          <div><h3>{item.subject}</h3><p>{item.message}</p></div>
          <time>{new Date(item.createdAt).toLocaleDateString()}</time>
        </article>
      )) : <p className="empty-notifications">No new messages from your mess team.</p>}
    </section>
  );
}

function StudentQuickLinks({ unreadCount }) {
  return (
    <section className="student-quick-links">
      <div className="section-heading"><div><p className="eyebrow">YOUR MESSMATE</p><h2>Quick links</h2></div></div>
      <div className="quick-link-grid">
        <Link to="/feedback"><strong>Feedback &amp; Ratings</strong><span>Rate a meal or update a review</span></Link>
        <Link to="/student/history"><strong>My Dining History</strong><span>Review personal meal choices and feedback</span></Link>
        <Link to="/student/notifications"><strong>Notifications {unreadCount > 0 && <span className="unread-count">{unreadCount}</span>}</strong><span>Announcements and recent mess updates</span></Link>
        <Link to="/recipes"><strong>Kettle Recipes</strong><span>Browse quick recipe ideas</span></Link>
      </div>
    </section>
  );
}
