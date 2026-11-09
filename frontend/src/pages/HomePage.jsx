import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import AppHeader from "../components/AppHeader.jsx";

const features = [
  {
    icon: "01",
    title: "Plan your plate",
    text: "See today's menu and tell the kitchen whether you're eating or skipping.",
  },
  {
    icon: "02",
    title: "Waste less food",
    text: "Meal counts help hostel teams prepare closer to what residents actually need.",
  },
  {
    icon: "03",
    title: "One clear view",
    text: "Students and admins get the right dining information in one place.",
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const destination = user?.role === "admin" ? "/admin" : "/student";

  return (
    <div className="landing-page">
      <AppHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">MESSMATE · SMART HOSTEL DINING MANAGEMENT SYSTEM</p>
            <h1>Good food.<br /><span>Less waste.</span></h1>
            <p className="hero-description">
              Reduce food wastage. Plan meals smarter. Manage hostel dining
              efficiently with a simple daily meal check-in.
            </p>
            <div className="hero-actions">
              {user ? (
                <Link className="button button-primary" to={destination}>Open my dashboard <span aria-hidden="true">→</span></Link>
              ) : (
                <>
                  <Link className="button button-primary" to="/login">Sign in <span aria-hidden="true">→</span></Link>
                  <Link className="button button-outline" to="/register">Create account</Link>
                </>
              )}
            </div>
            <div className="hero-note"><span className="live-dot" /> A more thoughtful way to dine together</div>
          </div>
          <div className="hero-visual" aria-label="Daily dining planning preview">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="visual-card">
              <div className="visual-card-top"><span className="visual-caption">YOUR MESS, IN SYNC</span><span className="visual-date">DAILY PLAN</span></div>
              <div className="visual-meal">
                <span className="visual-meal-icon">☀</span>
                <div className="visual-meal-copy"><span className="visual-meal-title">One clear menu</span><span className="visual-meal-subtitle">Vegetarian & non-vegetarian</span></div>
                <span className="visual-check" aria-hidden="true">✓</span>
              </div>
              <div className="visual-menu"><span className="tiny-veg" /> Choose the meals that work for you</div>
              <div className="visual-count"><div><strong>Plan with care</strong><span>Every choice helps the kitchen prepare.</span></div><div className="mini-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></div>
            </div>
            <div className="floating-leaf leaf-a" aria-hidden="true">✦</div>
            <div className="floating-leaf leaf-b" aria-hidden="true">✦</div>
          </div>
        </section>
        <section className="feature-section">
          <div className="section-intro"><p className="eyebrow">MADE FOR HOSTEL LIFE</p><h2>Dining that works<br />better for everyone.</h2></div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <span className="feature-number">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="role-cta">
          <div><p className="eyebrow">YOUR MESS, IN SYNC</p><h2>Small choices make<br />a meaningful difference.</h2></div>
          <div className="role-links">
            <Link to={user?.role === "student" ? "/student" : "/login"}><span>Student</span><strong>Plan tomorrow's meals ↗</strong></Link>
            <Link to={user?.role === "admin" ? "/admin" : "/login"}><span>Admin</span><strong>Manage dining ↗</strong></Link>
          </div>
        </section>
      </main>
      <footer className="site-footer"><span>MessMate</span><span>Plan with care. Serve with purpose.</span></footer>
    </div>
  );
}
