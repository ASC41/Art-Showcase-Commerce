import { Link, useLocation } from "wouter";

export default function Navbar() {
  const [location] = useLocation();

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "64px",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 40px",
        background: "rgba(8, 8, 8, 0.85)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <span
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "20px",
            fontWeight: 500,
            letterSpacing: "0.08em",
            color: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          Ryan Cellar
        </span>
      </Link>

      <div style={{ display: "flex", gap: "36px", alignItems: "center" }}>
        {[
          { label: "Gallery", href: "/" },
          { label: "Portfolio", href: "/portfolio" },
          { label: "About", href: "/about" },
        ].map(({ label, href }) => (
          <Link key={href} href={href} style={{ textDecoration: "none" }}>
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "13px",
                fontWeight: 400,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: location === href ? "#f5f5f5" : "#888",
                transition: "color 0.2s ease",
                cursor: "pointer",
              }}
            >
              {label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
