import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import { apiRequest } from "../api/client.js";

const mealNames = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["teaTime", "Tea Time"],
  ["dinner", "Dinner"],
];

function choiceLabel(choice) {
  if (choice?.status === "eat") {
    return `EAT · ${choice.mealType === "nonVeg" ? "NON-VEG" : choice.mealType === "veg" ? "VEG" : "Type not recorded"}`;
  }
  return choice?.status === "skip" ? "SKIP" : "NOT SELECTED";
}

export default function DiningHistoryPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [meal, setMeal] = useState("");
  const [data, setData] = useState({ meals: [], feedback: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (meal) params.set("meal", meal);
    setLoading(true);
    apiRequest(`/student/history?${params}`)
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [from, meal, to]);

  return (
    <div className="app-page">
      <AppHeader />
      <main className="dashboard-wrap">
        <section className="dashboard-heading">
          <div><p className="eyebrow">PERSONAL RECORDS</p><h1>My Dining History</h1><p className="muted-copy">Your saved preferences and feedback only. Meal preferences are not proof of actual attendance.</p></div>
          <Link className="button button-outline" to="/student">Back to Dashboard</Link>
        </section>
        {error && <div className="notice notice-error" role="status">{error}</div>}
        <div className="history-counts">
          <article className="summary-card"><span>EAT preferences</span><strong>{data.counts.eat ?? "—"}</strong></article>
          <article className="summary-card"><span>SKIP preferences</span><strong>{data.counts.skip ?? "—"}</strong></article>
          <article className="summary-card"><span>Not selected</span><strong>{data.counts.notSelected ?? "—"}</strong></article>
        </div>
        <section className="panel history-panel">
          <div className="filter-bar history-filters">
            <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            <label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value)}><option value="">All meals</option>{mealNames.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>
          {loading ? <div className="loading-line" role="status">Loading your history…</div> : (
            <>
              <div className="report-table-wrap"><table><thead><tr><th>Meal date</th>{mealNames.filter(([key]) => !meal || key === meal).map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>
                {data.meals.map((record) => <tr key={record.date}><th>{record.date}</th>{mealNames.filter(([key]) => !meal || key === meal).map(([key]) => <td key={key}>{choiceLabel(record.choices[key])}</td>)}</tr>)}
                {!data.meals.length && <tr><td colSpan={meal ? 2 : 5} className="empty-row">No meal preferences found for these filters.</td></tr>}
              </tbody></table></div>
              <div className="attendance-disclaimer">Actual attendance is not recorded for these meals, so no attendance history is available. Preferences above are kept separate.</div>
            </>
          )}
        </section>
        <section className="panel history-panel">
          <div className="panel-heading"><div><p className="eyebrow">YOUR REVIEWS</p><h2>Feedback history</h2></div><Link to="/feedback">Submit or update feedback</Link></div>
          {data.feedback.length ? <div className="report-table-wrap"><table><thead><tr><th>Date</th><th>Meal</th><th>Rating</th><th>Feedback</th><th>Updated</th></tr></thead><tbody>
            {data.feedback.map((item) => <tr key={item._id}><th>{item.date}</th><td>{mealNames.find(([key]) => key === item.meal)?.[1] || item.meal}</td><td>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)} ({item.rating}/5)</td><td>{item.feedback || "No written comment"}</td><td>{new Date(item.updatedAt).toLocaleString()}</td></tr>)}
          </tbody></table></div> : <p className="empty-notifications">No feedback matches these filters yet.</p>}
        </section>
      </main>
    </div>
  );
}
