import { useListArtworks } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import DraggableGallery, { DraggableGalleryItem } from "@/framer/draggable-gallery";
import Navbar from "@/components/Navbar";

import { ARTWORK_ASPECT } from "@/lib/artworkDimensions";

export default function Landing() {
  const { data: artworks, isLoading } = useListArtworks();
  const [, navigate] = useLocation();

  const SPACER: DraggableGalleryItem = { type: "empty", src: "", alt: "", title: "" };
  const items: DraggableGalleryItem[] = (() => {
    if (!artworks) return [];
    const result: DraggableGalleryItem[] = [];
    artworks.forEach((a, i) => {
      const ar = ARTWORK_ASPECT[a.slug] ?? 1.33;
      result.push({
        type: "image",
        src: a.imageUrl,
        alt: a.title,
        title: a.title,
        slug: a.slug,
        aspectRatio: ar,
        wide: ar < 1,
      });
      if ((i + 1) % 4 === 0) result.push(SPACER);
    });
    return result;
  })();

  function handleItemClick(item: DraggableGalleryItem) {
    if (item.slug) {
      navigate(`/portfolio?artwork=${item.slug}`);
    } else {
      navigate("/portfolio");
    }
  }

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

      {!isLoading && items.length > 0 && (
        <div style={{ position: "absolute", inset: 0 }}>
          <DraggableGallery
            items={items}
            columns={4}
            baseWidth={280}
            smallHeight={350}
            largeHeight={350}
            itemGap={14}
            hoverScale={1.04}
            expandedScale={0.82}
            dragEase={0.1}
            momentumFactor={20}
            bufferZone={0.5}
            borderRadius={4}
            background="#080808"
            vignetteStrength={0.7}
            vignetteSize={160}
            overlayOpacity={0.88}
            overlayDuration={0.45}
            animationDelay={0.05}
            closeAnimationDelay={0}
            font={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "15px",
              fontWeight: 400,
              letterSpacing: "0.04em",
              lineHeight: 1.3,
              textAlign: "left",
            }}
            captionColor="#f5f5f5"
            introAnimation="topLeft"
            onItemClick={handleItemClick}
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
