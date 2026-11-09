import { Link } from "react-router-dom";

export default function Brand({ light = false }) {
  return (
    <Link className={`brand${light ? " brand-light" : ""}`} to="/">
      <span className="brand-mark" aria-hidden="true">M</span>
      <span>MessMate</span>
    </Link>
  );
}
