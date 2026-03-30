import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useListArtworks } from "@workspace/api-client-react";
import GalleryX from "@/framer/gallery-x";
import "@/framer/styles.css";
import Navbar from "@/components/Navbar";

export default function Landing() {
  const [, navigate] = useLocation();
  const { data: artworks, isLoading } = useListArtworks();

  const items =
    artworks?.map((a) => ({
      title: a.title,
      image: { src: a.imageUrl, alt: a.title },
      year: a.year ?? 2024,
      hoverColor: ["#ffffff"],
      link: `/portfolio?artwork=${a.slug}`,
    })) ?? [];

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#080808",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Navbar />

      {/* Artist wordmark overlay */}
      <div
        style={{
          position: "absolute",
          bottom: "48px",
          left: "48px",
          zIndex: 50,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(36px, 5vw, 64px)",
            fontWeight: 300,
            letterSpacing: "0.08em",
            color: "rgba(245,245,245,0.9)",
            lineHeight: 1,
            textShadow: "0 2px 40px rgba(0,0,0,0.8)",
          }}
        >
          Ryan Cellar
        </div>
        <div
          style={{
            fontFamily: "'Inter'",
            fontSize: "12px",
            fontWeight: 400,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "rgba(245,245,245,0.45)",
            marginTop: "8px",
          }}
        >
          Contemporary Artist
        </div>
      </div>

      {/* Scroll hint */}
      <div
        style={{
          position: "absolute",
          bottom: "48px",
          right: "48px",
          zIndex: 50,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          opacity: 0.4,
        }}
      >
        <span
          style={{
            fontFamily: "'Inter'",
            fontSize: "11px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#f5f5f5",
          }}
        >
          Drag to explore
        </span>
      </div>

      {/* GalleryX */}
      {!isLoading && items.length > 0 && (
        <div style={{ position: "absolute", inset: 0 }}>
          <GalleryX
            items={items}
            cellSize={200}
            imageGap={8}
            background="#080808"
            arcAmount={0.4}
            arcMaxAngle={20}
            arcAxis="Horizontal"
            edgeFade={0.25}
            parallax={true}
            parallaxStrength={0.3}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      )}

      {isLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: "'Inter'",
              fontSize: "13px",
              letterSpacing: "0.2em",
              color: "#444",
              textTransform: "uppercase",
            }}
          >
            Loading
          </span>
        </div>
      )}
    </div>
  );
}
