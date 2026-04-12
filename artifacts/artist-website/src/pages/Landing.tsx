import { useListArtworks } from "@workspace/api-client-react";
import DraggableGallery, { DraggableGalleryItem } from "@/framer/draggable-gallery";
import Navbar from "@/components/Navbar";
import { ARTWORK_ASPECT } from "@/lib/artworkDimensions";
import { useLocation } from "wouter";

export default function Landing() {
  const { data: artworks, isLoading } = useListArtworks();
  const [, navigate] = useLocation();

  const SPACER: DraggableGalleryItem = { type: "empty", src: "", alt: "", title: "" };

  // Spacer after every 2nd artwork for more breathing room between paintings
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
      if ((i + 1) % 2 === 0) result.push(SPACER);
    });
    return result;
  })();

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

      {/* Signature — full-bleed background behind the gallery */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
          backgroundImage: `url("https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@300ac61782bfa80cf3bbe6b42b6a80ce29bb0883/uploads/2026-04-12T04-19-22-288Z-6egjzgyys.png")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          mixBlendMode: "screen",
        }}
      />

      {/* Drag hint */}
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          right: "48px",
          zIndex: 60,
          pointerEvents: "none",
          opacity: 0.35,
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

      {/* Gallery — transparent background so wordmark shows through gaps */}
      {!isLoading && items.length > 0 && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5 }}>
          <DraggableGallery
            items={items}
            columns={5}
            baseWidth={250}
            smallHeight={375}
            largeHeight={375}
            itemGap={22}
            hoverScale={1.04}
            expandedScale={0.82}
            dragEase={0.1}
            momentumFactor={20}
            bufferZone={0.5}
            borderRadius={4}
            background="transparent"
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
            showCellCaptions={false}
            onViewInPortfolio={(item) => {
              if (item.slug) {
                setTimeout(() => navigate(`/portfolio?artwork=${item.slug}`), 480);
              }
            }}
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
