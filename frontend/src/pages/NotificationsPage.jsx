import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import { apiRequest } from "../api/client.js";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest("/student/notifications");
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markRead(notification) {
    if (notification.isRead) return;
    try {
      await apiRequest(`/student/notifications/${notification._id}/read`, { method: "PATCH" });
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="app-page">
      <AppHeader />
      <main className="dashboard-wrap">
        <section className="dashboard-heading">
          <div><p className="eyebrow">MESS UPDATES</p><h1>Notifications</h1><p className="muted-copy">{unreadCount} unread notification{unreadCount === 1 ? "" : "s"}.</p></div>
          <Link className="button button-outline" to="/student">Back to Dashboard</Link>
        </section>
        {error && <div className="notice notice-error" role="status">{error}</div>}
        {loading ? <div className="loading-panel" role="status">Loading your notifications…</div> : notifications.length ? (
          <section className="student-notifications notification-page-list">
            {notifications.map((item) => (
              <article className={`student-notification${item.isRead ? "" : " notification-unread"}`} key={item._id}>
                <div><p className="eyebrow">{String(item.category || item.kind || "announcement").replaceAll("-", " ").toUpperCase()}</p><h2>{item.subject}</h2><p>{item.message}</p></div>
                <div className="notification-page-meta"><time>{new Date(item.createdAt).toLocaleString()}</time><span>{item.isRead ? "Read" : "Unread"}</span>{!item.isRead && <button className="table-action" type="button" onClick={() => markRead(item)}>Mark as read</button>}</div>
              </article>
            ))}
          </section>
        ) : <p className="empty-notifications">No notifications yet.</p>}
      </main>
    </div>
  );
}
