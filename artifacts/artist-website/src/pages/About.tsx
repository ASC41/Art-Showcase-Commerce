import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import Navbar from "@/components/Navbar";
import { Link } from "wouter";

const IMAGE_A =
  "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@b44d1d62aa42791752090a1da9c71a3ca9af1e15/uploads/2026-03-31T01-52-59-145Z-yxebv7avv.jpg";
const IMAGE_B =
  "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@9945ae1994b6366c3943e8e125bb3700e7336b83/uploads/2026-03-31T01-53-19-925Z-y59y2l4f4.jpg";

function ParallaxHero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "28%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        height: "100vh",
        overflow: "hidden",
        background: "#060606",
      }}
    >
      {/* Parallax photo */}
      <motion.div
        style={{
          position: "absolute",
          inset: "-15% 0",
          backgroundImage: `url(${IMAGE_A})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
          y,
          filter: "brightness(0.55) saturate(1.3) contrast(1.1)",
        }}
      />

      {/* Grain texture overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "200px 200px",
          opacity: 0.06,
          pointerEvents: "none",
          zIndex: 1,
          mixBlendMode: "overlay",
        }}
      />

      {/* Bottom gradient fade */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(6,6,6,0.15) 0%, rgba(6,6,6,0) 30%, rgba(6,6,6,0) 55%, rgba(6,6,6,0.95) 100%)",
          zIndex: 2,
          pointerEvents: "none",
        }}
      />

      {/* Top fade for navbar */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(6,6,6,0.6) 0%, rgba(6,6,6,0) 18%)",
          zIndex: 2,
          pointerEvents: "none",
        }}
      />

      {/* Hero text */}
      <motion.div
        style={{
          position: "absolute",
          bottom: "10%",
          left: 0,
          right: 0,
          padding: "0 48px",
          zIndex: 3,
          opacity,
        }}
      >
        <p
          style={{
            fontFamily: "'Inter'",
            fontSize: "11px",
            fontWeight: 400,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "rgba(245,245,245,0.4)",
            margin: "0 0 14px",
          }}
        >
          Contemporary Surrealist Figurative Artist
        </p>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(52px, 7vw, 96px)",
            fontWeight: 300,
            letterSpacing: "0.04em",
            color: "#f5f5f5",
            margin: 0,
            lineHeight: 0.95,
          }}
        >
          Ryan
          <br />
          Cellar
        </h1>
      </motion.div>
    </div>
  );
}

function TreatmentPhoto() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/10",
        overflow: "hidden",
        background: "#060606",
        margin: "0 0 0",
      }}
    >
      <motion.div
        style={{
          position: "absolute",
          inset: "-10% 0",
          backgroundImage: `url(${IMAGE_B})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          y,
          filter: "brightness(0.6) saturate(0.85) contrast(1.15)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(20, 30, 60, 0.22)",
          mixBlendMode: "multiply",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "200px 200px",
          opacity: 0.07,
          pointerEvents: "none",
          mixBlendMode: "overlay",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export default function About() {
  return (
    <div style={{ minHeight: "100vh", background: "#060606", color: "#f5f5f5" }}>
      <Navbar />

      {/* Hero photo */}
      <ParallaxHero />

      {/* Bio section */}
      <div
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          padding: "96px 40px 80px",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "1px",
            background: "rgba(255,255,255,0.2)",
            marginBottom: "48px",
          }}
        />

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
            margin: 0,
          }}
        >
          Each work begins as a confrontation and ends as a kind of resolution — not triumph, but
          an acknowledgment that difficulty can be witnessed, expressed, and transformed.
        </p>
      </div>

      {/* Second photo treatment */}
      <TreatmentPhoto />

      {/* Contact */}
      <div
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          padding: "80px 40px 100px",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "1px",
            background: "rgba(255,255,255,0.12)",
            marginBottom: "48px",
          }}
        />

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

        <div style={{ marginTop: "64px" }}>
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
