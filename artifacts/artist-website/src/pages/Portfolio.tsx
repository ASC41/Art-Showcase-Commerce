import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useListArtworks } from "@workspace/api-client-react";
import type { Artwork } from "@workspace/api-client-react";
import Navbar from "@/components/Navbar";
import ScrollGrid from "@/components/ScrollGrid";
import ArtworkLightbox from "@/components/ArtworkLightbox";

export default function Portfolio() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const artworkSlug = params.get("artwork");

  const { data: artworks, isLoading } = useListArtworks();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (artworks && artworkSlug) {
      const idx = artworks.findIndex((a) => a.slug === artworkSlug);
      if (idx !== -1) {
        setLightboxIndex(idx);
      }
    }
  }, [artworks, artworkSlug]);

  const handleItemClick = (artwork: Artwork, index: number) => {
    setLightboxIndex(index);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080808",
        color: "#f5f5f5",
      }}
    >
      <Navbar />

      {/* Header */}
      <div
        style={{
          paddingTop: "120px",
          paddingBottom: "40px",
          paddingLeft: "40px",
          paddingRight: "40px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          marginBottom: "40px",
        }}
      >
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(36px, 4vw, 56px)",
            fontWeight: 300,
            letterSpacing: "0.06em",
            color: "#f5f5f5",
            margin: "0 0 12px",
          }}
        >
          Portfolio
        </h1>
        {artworks && (
          <p
            style={{
              fontFamily: "'Inter'",
              fontSize: "13px",
              color: "#666",
              letterSpacing: "0.08em",
              margin: 0,
            }}
          >
            {artworks.length} works
            {artworks.filter((a) => a.status === "available").length > 0
              ? ` — ${artworks.filter((a) => a.status === "available").length} available`
              : ""}
          </p>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingTop: "80px",
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
      ) : artworks ? (
        <ScrollGrid artworks={artworks} columns={3} gap={20} onItemClick={handleItemClick} showAnimationBar={false} />
      ) : null}

      {/* Lightbox */}
      {lightboxIndex !== null && artworks && (
        <ArtworkLightbox
          artworks={artworks}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={(index) => setLightboxIndex(index)}
        />
      )}
    </div>
  );
}
