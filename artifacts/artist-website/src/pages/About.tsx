import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import Navbar from "@/components/Navbar";
import { Link } from "wouter";

const IMAGE_A =
  "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@990d8c2ae129855c329db463e8506e8344dd8e21/uploads/2026-04-01T01-02-14-259Z-plfdrd2mp.jpg";
const IMAGE_B =
  "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@300ac61782bfa80cf3bbe6b42b6a80ce29bb0883/uploads/2026-04-12T04-19-22-288Z-6egjzgyys.png";

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
          backgroundPosition: "center 30%",
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
          backgroundSize: "contain",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          y,
          mixBlendMode: "screen",
        }}
      />

      {/* Grain texture */}
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

      {/* Top fade — bio text dissolves into the image */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(6,6,6,1) 0%, rgba(6,6,6,0) 35%)",
          zIndex: 3,
          pointerEvents: "none",
        }}
      />

      {/* Radial edge vignette */}
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
          Ryan Cellar is a Nashville-born contemporary artist and lifelong member of the city's
          arts community, working in acrylic across surrealist and figurative traditions. His
          figures exist in spaces that feel both intimate and otherworldly, grounded in lived
          experience but pushed into something stranger and more resonant.
        </p>

        <p
          style={{
            fontFamily: "'Inter'",
            fontSize: "16px",
            fontWeight: 400,
            lineHeight: 1.85,
            color: "rgba(245,245,245,0.6)",
            margin: 0,
          }}
        >
          Cellar is an emerging voice in Nashville's contemporary art scene, building a body of
          work that is as emotionally precise as it is visually arresting.
        </p>
      </div>

      {/* Second image + contact footer — footer is pinned to the bottom of the image */}
      <div style={{ position: "relative" }}>
        <TreatmentPhoto />

        {/* Contact — overlays the bottom of the image */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            background: "transparent",
            padding: "80px 40px 64px",
          }}
        >
          <div
            style={{
              maxWidth: "760px",
              margin: "0 auto",
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
      </div>
    </div>
  );
}
