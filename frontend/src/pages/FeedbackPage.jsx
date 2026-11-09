import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import { apiRequest } from "../api/client.js";

const meals = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["teaTime", "Tea Time"],
  ["dinner", "Dinner"],
];

function getTodayInIndia() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default function FeedbackPage() {
  const [meal, setMeal] = useState("breakfast");
  const [date, setDate] = useState(getTodayInIndia);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loadingReview, setLoadingReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ text: "", error: false });

  useEffect(() => {
    let active = true;
    setLoadingReview(true);
    apiRequest(`/student/feedback?date=${encodeURIComponent(date)}&meal=${encodeURIComponent(meal)}`)
      .then((result) => {
        if (!active) return;
        const saved = result.feedback?.[0];
        setRating(saved?.rating || 0);
        setFeedback(saved?.feedback || "");
        setNotice({ text: "", error: false });
      })
      .catch((error) => {
        if (active) setNotice({ text: error.message, error: true });
      })
      .finally(() => {
        if (active) setLoadingReview(false);
      });
    return () => {
      active = false;
    };
  }, [date, meal]);

  async function submit(event) {
    event.preventDefault();
    if (!rating) {
      setNotice({ text: "Choose a rating from 1 to 5 stars.", error: true });
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest("/student/feedback", {
        method: "PUT",
        body: { date, meal, rating, feedback },
      });
      setRating(result.feedback.rating);
      setFeedback(result.feedback.feedback);
      setNotice({
        text: result.updated
          ? "Your feedback has been updated."
          : result.emailStatus === "sent"
            ? "Thank you. Your feedback has been saved and the mess team has been notified."
            : "Thank you. Your feedback has been saved. The email alert could not be sent, but your review is available to the mess team.",
        error: false,
      });
    } catch (error) {
      setNotice({ text: error.message, error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-page">
      <AppHeader />
      <main className="dashboard-wrap">
        <section className="dashboard-heading">
          <div>
            <p className="eyebrow">YOUR VOICE MATTERS</p>
            <h1>Feedback &amp; Ratings</h1>
            <p className="muted-copy">Rate a meal and share a comment with the mess team. You can update your review for the same meal and date.</p>
          </div>
          <Link className="button button-outline" to="/student">Back to Dashboard</Link>
        </section>
        {notice.text && <div className={`notice${notice.error ? " notice-error" : " notice-success"}`} role="status">{notice.text}</div>}
        <form className="panel feedback-form" onSubmit={submit}>
          <label>Meal
            <select required value={meal} onChange={(event) => setMeal(event.target.value)}>
              {meals.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Meal date
            <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <fieldset className="rating-picker" disabled={loadingReview || saving}>
            <legend>Rating</legend>
            <div role="radiogroup" aria-label="Meal rating from one to five stars">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} aria-label={`${value} star${value === 1 ? "" : "s"}`}>
                  <input
                    type="radio"
                    name="rating"
                    value={value}
                    checked={rating === value}
                    onChange={() => setRating(value)}
                  />
                  <span aria-hidden="true">{value <= rating ? "★" : "☆"}</span>
                </label>
              ))}
              <strong>{rating ? `${rating} / 5` : "Select a rating"}</strong>
            </div>
          </fieldset>
          <label className="feedback-comment">Written feedback (optional)
            <textarea
              rows="5"
              maxLength="2000"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="What went well? What could be improved?"
            />
            <small>{feedback.length} / 2000 characters</small>
          </label>
          <div className="feedback-submit">
            <button className="button button-primary" type="submit" disabled={loadingReview || saving}>
              {loadingReview ? "Loading saved review…" : saving ? "Saving feedback…" : "Submit Feedback"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
