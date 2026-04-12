import { useState, useEffect, type CSSProperties } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="18" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
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
      style={{
        cursor: "pointer",
        display: "inline-block",
        letterSpacing: hovered ? "0.13em" : "0.08em",
        transition: "letter-spacing 0.55s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {chars.map((char, i) => (
        <span
          key={i}
          style={(() => {
            const delay = hovered
              ? `${i * 28}ms`
              : `${(chars.length - 1 - i) * 16}ms`;
            return {
              display: "inline-block",
              whiteSpace: "pre" as const,
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "20px",
              fontWeight: 500,
              color: hovered ? "#ffffff" : "#b8b8b8",
              textShadow: hovered
                ? "0 0 18px rgba(255,255,255,0.45), 0 0 4px rgba(255,255,255,0.2)"
                : "none",
              transition: `color 0.5s ease ${delay}, text-shadow 0.5s ease ${delay}`,
            };
          })()}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

function HamburgerIcon({ isOpen }: { isOpen: boolean }) {
  const line = (rotate: string, y: number, opacity = 1): CSSProperties => ({
    position: "absolute",
    left: 0,
    width: "22px",
    height: "1.5px",
    background: "#f5f5f5",
    borderRadius: "2px",
    top: `${y}px`,
    transition: "transform 0.3s ease, opacity 0.25s ease",
    transformOrigin: "center",
    transform: isOpen ? rotate : "none",
    opacity,
  });

  return (
    <div style={{ position: "relative", width: "22px", height: "16px" }}>
      <span style={line(isOpen ? "rotate(45deg) translate(5px, 5px)" : "none", 0)} />
      <span style={line("none", 7, isOpen ? 0 : 1)} />
      <span style={line(isOpen ? "rotate(-45deg) translate(5px, -5px)" : "none", 14)} />
    </div>
  );
}

const NAV_LINKS = [
  { label: "Gallery", href: "/" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Merch", href: "/merch" },
  { label: "Inquire", href: "/inquire" },
  { label: "About", href: "/about" },
];

export default function Navbar() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  if (isMobile) {
    return (
      <>
        {/* Mobile navbar bar */}
        <nav
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: "56px",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
            background: "rgba(8, 8, 8, 0.95)",
            backdropFilter: "blur(20px)",
            borderBottom: menuOpen ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Link href="/" style={{ textDecoration: "none" }} onClick={() => setMenuOpen(false)}>
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "19px",
                fontWeight: 500,
                letterSpacing: "0.08em",
                color: "#f5f5f5",
                opacity: 0.9,
              }}
            >
              Ryan Cellar
            </span>
          </Link>

          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "10px 4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HamburgerIcon isOpen={menuOpen} />
          </button>
        </nav>

        {/* Mobile full-screen menu panel */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              key="mobile-menu"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              style={{
                position: "fixed",
                top: "56px",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 299,
                background: "rgba(6, 6, 6, 0.98)",
                backdropFilter: "blur(24px)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "48px 32px 52px",
                overflowY: "auto",
              }}
            >
              {/* Nav links */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {NAV_LINKS.map(({ label, href }, i) => {
                  const isActive = location === href;
                  return (
                    <motion.div
                      key={href}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.04 }}
                    >
                      <Link href={href} style={{ textDecoration: "none" }}>
                        <div
                          style={{
                            padding: "16px 0",
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "'Cormorant Garamond', serif",
                              fontSize: "32px",
                              fontWeight: 300,
                              letterSpacing: "0.04em",
                              color: isActive ? "#f5f5f5" : "rgba(245,245,245,0.55)",
                              transition: "color 0.2s",
                            }}
                          >
                            {label}
                          </span>
                          {isActive && (
                            <div
                              style={{
                                width: "5px",
                                height: "5px",
                                borderRadius: "50%",
                                background: "#f5f5f5",
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>

              {/* Bottom: social icons */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                style={{
                  display: "flex",
                  gap: "28px",
                  alignItems: "center",
                  paddingTop: "40px",
                }}
              >
                <a
                  href="https://www.instagram.com/ryan_cellar/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "rgba(245,245,245,0.5)", display: "flex", alignItems: "center" }}
                  aria-label="Instagram"
                >
                  <InstagramIcon />
                </a>
                <a
                  href="https://www.tiktok.com/@ryan.cellar.art"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "rgba(245,245,245,0.5)", display: "flex", alignItems: "center" }}
                  aria-label="TikTok"
                >
                  <TikTokIcon />
                </a>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // ── Desktop navbar (unchanged) ────────────────────────────────────────────
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
        {NAV_LINKS.map(({ label, href }) => (
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

        <div style={{ width: "1px", height: "18px", background: "rgba(255,255,255,0.1)" }} />

        <a
          href="https://www.instagram.com/ryan_cellar/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#888", display: "flex", alignItems: "center", transition: "color 0.2s ease", lineHeight: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#f5f5f5")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
          aria-label="Instagram"
        >
          <InstagramIcon />
        </a>

        <a
          href="https://www.tiktok.com/@ryan.cellar.art"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#888", display: "flex", alignItems: "center", transition: "color 0.2s ease", lineHeight: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#f5f5f5")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
          aria-label="TikTok"
        >
          <TikTokIcon />
        </a>
      </div>
    </nav>
  );
}
