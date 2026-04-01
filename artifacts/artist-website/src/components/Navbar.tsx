import { useState } from "react";
import { Link, useLocation } from "wouter";

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="16" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
    </svg>
  );
}

function WaveLogo({ text }: { text: string }) {
  const [hovered, setHovered] = useState(false);
  const chars = text.split("");

  return (
    <span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: "pointer", display: "inline-block" }}
    >
      {chars.map((char, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            whiteSpace: "pre",
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "20px",
            fontWeight: 500,
            letterSpacing: "0.08em",
            color: "#f5f5f5",
            transition: "transform 0.45s ease, opacity 0.45s ease",
            transitionDelay: hovered
              ? `${i * 30}ms`
              : `${(chars.length - 1 - i) * 18}ms`,
            transform: hovered ? "translateY(-3px)" : "translateY(0px)",
            opacity: hovered ? 1 : 0.82,
          }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

export default function Navbar() {
  const [location] = useLocation();

  const navLinks = [
    { label: "Gallery", href: "/" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Merch", href: "/merch" },
    { label: "Inquire", href: "/inquire" },
    { label: "About", href: "/about" },
  ];

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
        <WaveLogo text="Ryan Cellar" />
      </Link>

      <div style={{ display: "flex", gap: "36px", alignItems: "center" }}>
        {navLinks.map(({ label, href }) => (
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

        {/* Divider */}
        <div style={{ width: "1px", height: "18px", background: "rgba(255,255,255,0.1)" }} />

        {/* Social icons */}
        <a
          href="https://www.instagram.com/ryan_cellar/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#888",
            display: "flex",
            alignItems: "center",
            transition: "color 0.2s ease",
            lineHeight: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#f5f5f5")}
          onMouseLeave={e => (e.currentTarget.style.color = "#888")}
          aria-label="Instagram"
        >
          <InstagramIcon />
        </a>

        <a
          href="https://www.tiktok.com/@ryan.cellar.art"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#888",
            display: "flex",
            alignItems: "center",
            transition: "color 0.2s ease",
            lineHeight: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#f5f5f5")}
          onMouseLeave={e => (e.currentTarget.style.color = "#888")}
          aria-label="TikTok"
        >
          <TikTokIcon />
        </a>
      </div>
    </nav>
  );
}
