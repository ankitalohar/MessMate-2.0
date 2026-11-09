import Brand from "./Brand.jsx";

export default function AuthLayout({ eyebrow, title, description, children, footer }) {
  return (
    <main className="auth-page">
      <Brand />
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="auth-title">{title}</h1>
        <p className="muted-copy">{description}</p>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
      <a className="back-home" href="/">← Back to home</a>
    </main>
  );
}
