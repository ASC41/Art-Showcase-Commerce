import Navbar from "@/components/Navbar";
import { Link } from "wouter";

export default function About() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080808",
        color: "#f5f5f5",
      }}
    >
      <Navbar />

      <div
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          padding: "140px 40px 80px",
        }}
      >
        {/* Name */}
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(48px, 6vw, 80px)",
            fontWeight: 300,
            letterSpacing: "0.05em",
            color: "#f5f5f5",
            margin: "0 0 8px",
            lineHeight: 1,
          }}
        >
          Ryan Cellar
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontFamily: "'Inter'",
            fontSize: "13px",
            fontWeight: 400,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#666",
            margin: "0 0 64px",
          }}
        >
          Contemporary Artist
        </p>

        {/* Divider */}
        <div
          style={{
            width: "48px",
            height: "1px",
            background: "rgba(255,255,255,0.2)",
            marginBottom: "48px",
          }}
        />

        {/* Bio */}
        <p
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(19px, 2.2vw, 24px)",
            fontWeight: 300,
            lineHeight: 1.75,
            color: "rgba(245,245,245,0.85)",
            margin: "0 0 40px",
            letterSpacing: "0.01em",
          }}
        >
          Ryan Cellar is a contemporary artist working primarily in acrylic, whose practice is
          rooted in the direct confrontation of mental illness through color and form.
        </p>

        <p
          style={{
            fontFamily: "'Inter'",
            fontSize: "16px",
            fontWeight: 400,
            lineHeight: 1.85,
            color: "rgba(245,245,245,0.6)",
            margin: "0 0 40px",
          }}
        >
          His work emerges from the intersection of lived experience and formal experimentation
          — using the act of painting as a form of exposure therapy, and color as a means of
          facing difficult truths. Though emotionally heavy in nature, his paintings carry an
          underlying current of perseverance, resilience, and cosmic wonder.
        </p>

        <p
          style={{
            fontFamily: "'Inter'",
            fontSize: "16px",
            fontWeight: 400,
            lineHeight: 1.85,
            color: "rgba(245,245,245,0.5)",
            margin: "0 0 80px",
          }}
        >
          Each work begins as a confrontation and ends as a kind of resolution — not triumph, but
          an acknowledgment that difficulty can be witnessed, expressed, and transformed.
        </p>

        {/* Divider */}
        <div
          style={{
            width: "48px",
            height: "1px",
            background: "rgba(255,255,255,0.12)",
            marginBottom: "48px",
          }}
        />

        {/* Contact */}
        <div>
          <p
            style={{
              fontFamily: "'Inter'",
              fontSize: "12px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#555",
              marginBottom: "12px",
            }}
          >
            Contact
          </p>
          <a
            href="mailto:ryancellart@gmail.com"
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "20px",
              fontWeight: 400,
              color: "#f5f5f5",
              textDecoration: "none",
              letterSpacing: "0.03em",
              borderBottom: "1px solid rgba(255,255,255,0.2)",
              paddingBottom: "2px",
              transition: "border-color 0.2s",
            }}
          >
            ryancellart@gmail.com
          </a>
        </div>

        {/* View Portfolio link */}
        <div style={{ marginTop: "80px" }}>
          <Link href="/portfolio" style={{ textDecoration: "none" }}>
            <span
              style={{
                fontFamily: "'Inter'",
                fontSize: "13px",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "#888",
                cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.15)",
                paddingBottom: "2px",
              }}
            >
              View Portfolio →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
