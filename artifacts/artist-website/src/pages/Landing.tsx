import { useListArtworks } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import GalleryX from "@/framer/gallery-x";
import Navbar from "@/components/Navbar";

export default function Landing() {
  const { data: artworks, isLoading } = useListArtworks();
  const [, navigate] = useLocation();

  const items =
    artworks?.map((a) => ({
      title: a.title,
      image: { src: a.imageUrl, alt: a.title },
      year: 2024,
      hoverColor: "#888888",
      slug: a.slug,
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

      {/* Drag hint */}
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

      {/* GalleryX infinite draggable grid */}
      {!isLoading && items.length > 0 && (
        <div style={{ position: "absolute", inset: 0 }}>
          <GalleryX
            items={items}
            cellSize={280}
            gap={14}
            backgroundColor="#080808"
            arcAmount={0.4}
            arcMaxAngleDeg={22}
            arcAxis="horizontal"
            edgeFade={0.3}
            parallaxEnabled={true}
            parallaxStrength={0.08}
            parallaxEase={0.1}
            inertiaEnabled={true}
            throwFriction={0.92}
            onItemClick={(item: Record<string, unknown>) =>
              navigate(
                `/portfolio?artwork=${item.slug ?? ""}`,
              )
            }
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
