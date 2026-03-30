import { useEffect, useCallback } from "react";
import { useCreateCheckoutSession } from "@workspace/api-client-react";
import type { Artwork } from "@workspace/api-client-react";

interface Props {
  artworks: Artwork[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function ArtworkLightbox({ artworks, currentIndex, onClose, onNavigate }: Props) {
  const artwork = artworks[currentIndex];
  const checkoutMutation = useCreateCheckoutSession();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < artworks.length - 1)
        onNavigate(currentIndex + 1);
    },
    [currentIndex, artworks.length, onClose, onNavigate]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  if (!artwork) return null;

  const formatPrice = (cents: number | null) => {
    if (!cents) return null;
    return `$${(cents / 100).toLocaleString("en-US")}`;
  };

  const handleBuy = async (purchaseType: "original" | "print") => {
    try {
      const result = await checkoutMutation.mutateAsync({
        data: {
          artworkSlug: artwork.slug,
          purchaseType,
          customerEmail: null,
          successUrl: `${window.location.origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/portfolio`,
        },
      });
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Unable to start checkout. Please try again.");
    }
  };

  const isAvailable = artwork.status === "available";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(8,8,8,0.97)",
        display: "flex",
        flexDirection: "column",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: "24px",
          right: "28px",
          background: "transparent",
          border: "none",
          color: "#888",
          fontSize: "28px",
          cursor: "pointer",
          zIndex: 10,
          lineHeight: 1,
          padding: "8px",
          transition: "color 0.2s",
        }}
        onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#f5f5f5")}
        onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#888")}
      >
        ×
      </button>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 80px 0",
          minHeight: 0,
        }}
      >
        <img
          src={artwork.imageUrl}
          alt={artwork.title}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
      </div>

      {/* Bottom info panel */}
      <div
        style={{
          padding: "28px 60px 32px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "40px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(8,8,8,0.9)",
          flexShrink: 0,
        }}
      >
        {/* Left: artwork details */}
        <div style={{ flex: 1 }}>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "28px",
              fontWeight: 400,
              color: "#f5f5f5",
              margin: "0 0 8px",
              letterSpacing: "0.02em",
            }}
          >
            {artwork.title}
          </h2>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "8px" }}>
            {artwork.year && (
              <span style={{ fontFamily: "'Inter'", fontSize: "13px", color: "#888" }}>
                {artwork.year}
              </span>
            )}
            {artwork.medium && (
              <span style={{ fontFamily: "'Inter'", fontSize: "13px", color: "#888" }}>
                {artwork.medium}
              </span>
            )}
            {artwork.dimensions && (
              <span style={{ fontFamily: "'Inter'", fontSize: "13px", color: "#888" }}>
                {artwork.dimensions}
              </span>
            )}
          </div>
          {artwork.description && (
            <p
              style={{
                fontFamily: "'Inter'",
                fontSize: "14px",
                color: "#666",
                margin: "0",
                maxWidth: "500px",
                lineHeight: 1.6,
              }}
            >
              {artwork.description}
            </p>
          )}
        </div>

        {/* Right: price + buttons */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "16px",
            flexShrink: 0,
          }}
        >
          {/* Status badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {isAvailable && artwork.price && (
              <span
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "24px",
                  fontWeight: 400,
                  color: "#f5f5f5",
                }}
              >
                {formatPrice(artwork.price)}
              </span>
            )}
            <span
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: "4px",
                fontSize: "11px",
                fontFamily: "'Inter'",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                background: isAvailable ? "rgba(74, 222, 128, 0.15)" : "rgba(82,82,82,0.3)",
                color: isAvailable ? "#4ade80" : "#888",
                border: `1px solid ${isAvailable ? "rgba(74,222,128,0.3)" : "rgba(82,82,82,0.4)"}`,
              }}
            >
              {artwork.status === "sold" ? "Sold" : artwork.status === "available" ? "Available" : "Not for sale"}
            </span>
          </div>

          {/* CTA Buttons */}
          <div style={{ display: "flex", gap: "12px" }}>
            {isAvailable && artwork.price && (
              <button
                onClick={() => handleBuy("original")}
                disabled={checkoutMutation.isPending}
                style={{
                  padding: "12px 24px",
                  background: "#f5f5f5",
                  color: "#080808",
                  border: "none",
                  borderRadius: "4px",
                  fontFamily: "'Inter'",
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  cursor: checkoutMutation.isPending ? "not-allowed" : "pointer",
                  opacity: checkoutMutation.isPending ? 0.6 : 1,
                  transition: "opacity 0.2s",
                  whiteSpace: "nowrap",
                }}
              >
                {checkoutMutation.isPending ? "Loading..." : "Buy Original"}
              </button>
            )}
            <button
              onClick={() => handleBuy("print")}
              disabled={checkoutMutation.isPending}
              style={{
                padding: "12px 24px",
                background: "transparent",
                color: "#f5f5f5",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "4px",
                fontFamily: "'Inter'",
                fontSize: "13px",
                fontWeight: 500,
                letterSpacing: "0.05em",
                cursor: checkoutMutation.isPending ? "not-allowed" : "pointer",
                opacity: checkoutMutation.isPending ? 0.6 : 1,
                transition: "all 0.2s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.5)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.2)";
              }}
            >
              Buy Print — $45
            </button>
          </div>
        </div>
      </div>

      {/* Navigation arrows */}
      {currentIndex > 0 && (
        <button
          onClick={() => onNavigate(currentIndex - 1)}
          style={{
            position: "absolute",
            left: "20px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#888",
            borderRadius: "50%",
            width: "48px",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "20px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.color = "#f5f5f5";
            (e.target as HTMLElement).style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.color = "#888";
            (e.target as HTMLElement).style.background = "rgba(255,255,255,0.05)";
          }}
        >
          ‹
        </button>
      )}
      {currentIndex < artworks.length - 1 && (
        <button
          onClick={() => onNavigate(currentIndex + 1)}
          style={{
            position: "absolute",
            right: "20px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#888",
            borderRadius: "50%",
            width: "48px",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "20px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.color = "#f5f5f5";
            (e.target as HTMLElement).style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.color = "#888";
            (e.target as HTMLElement).style.background = "rgba(255,255,255,0.05)";
          }}
        >
          ›
        </button>
      )}
    </div>
  );
}
