import { useState, useEffect, useCallback, useRef } from "react";
import { useCreateCheckoutSession } from "@workspace/api-client-react";
import type { Artwork, PrintType, PrintSize } from "@workspace/api-client-react";

interface Props {
  artworks: Artwork[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const PRINT_SIZES: PrintSize[] = ["8x10", "11x14", "18x24", "24x36"];
const SIZE_LABELS: Record<PrintSize, string> = {
  "8x10":  '8" × 10"',
  "11x14": '11" × 14"',
  "18x24": '18" × 24"',
  "24x36": '24" × 36"',
};
const PRINT_PRICES: Record<PrintType, Record<PrintSize, number>> = {
  matte:  { "8x10": 35, "11x14": 45, "18x24": 65, "24x36": 95 },
  framed: { "8x10": 65, "11x14": 85, "18x24": 115, "24x36": 165 },
};

export default function ArtworkLightbox({ artworks, currentIndex, onClose, onNavigate }: Props) {
  const artwork = artworks[currentIndex];
  const checkoutMutation = useCreateCheckoutSession();
  const [showInfo, setShowInfo] = useState(false);
  const [showPrintPicker, setShowPrintPicker] = useState(false);
  const [selectedPrintType, setSelectedPrintType] = useState<PrintType>("matte");
  const [selectedPrintSize, setSelectedPrintSize] = useState<PrintSize>("18x24");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showPrintPicker) {
          setShowPrintPicker(false);
        } else {
          onClose();
        }
      }
      if (!showPrintPicker) {
        if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
        if (e.key === "ArrowRight" && currentIndex < artworks.length - 1)
          onNavigate(currentIndex + 1);
      }
    },
    [currentIndex, artworks.length, onClose, onNavigate, showPrintPicker]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  useEffect(() => {
    setShowInfo(false);
    setShowPrintPicker(false);
  }, [currentIndex]);

  if (!artwork) return null;

  const formatPrice = (cents: number | null) => {
    if (!cents) return null;
    return `$${(cents / 100).toLocaleString("en-US")}`;
  };

  const handleBuyOriginal = async () => {
    try {
      const result = await checkoutMutation.mutateAsync({
        data: {
          artworkSlug: artwork.slug,
          purchaseType: "original",
          customerEmail: null,
          successUrl: `${window.location.origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/portfolio`,
        },
      });
      if (result.url) window.location.href = result.url;
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Unable to start checkout. Please try again.");
    }
  };

  const handleBuyPrint = async () => {
    try {
      const result = await checkoutMutation.mutateAsync({
        data: {
          artworkSlug: artwork.slug,
          purchaseType: "print",
          printType: selectedPrintType,
          printSize: selectedPrintSize,
          customerEmail: null,
          successUrl: `${window.location.origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/portfolio`,
        },
      });
      if (result.url) window.location.href = result.url;
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Unable to start checkout. Please try again.");
    }
  };

  const isAvailable = artwork.status === "available";

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (showPrintPicker) return;
    const threshold = e.currentTarget.getBoundingClientRect().height * 0.65;
    const relativeY = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const entering = relativeY > threshold;
    if (entering) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setShowInfo(true);
    } else {
      if (!hideTimerRef.current) {
        hideTimerRef.current = setTimeout(() => {
          setShowInfo(false);
          hideTimerRef.current = null;
        }, 300);
      }
    }
  };

  const handleMouseLeave = () => {
    if (showPrintPicker) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setShowInfo(false);
      hideTimerRef.current = null;
    }, 200);
  };

  const cancelHide = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const selectedPrice = PRINT_PRICES[selectedPrintType][selectedPrintSize];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(8,8,8,0.97)",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Full-screen image */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 80px",
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

      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: "24px",
          right: "28px",
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.35)",
          fontSize: "28px",
          cursor: "pointer",
          zIndex: 20,
          lineHeight: 1,
          padding: "8px",
          transition: "color 0.2s",
        }}
        onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#f5f5f5")}
        onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.35)")}
      >
        ×
      </button>

      {/* Subtle bottom hint */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "72px",
          background: "linear-gradient(to top, rgba(8,8,8,0.6) 0%, transparent 100%)",
          display: "flex",
          alignItems: "flex-end",
          padding: "0 60px 18px",
          pointerEvents: "none",
          opacity: showInfo || showPrintPicker ? 0 : 1,
          transition: "opacity 0.3s",
        }}
      >
        <span
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "13px",
            letterSpacing: "0.14em",
            color: "rgba(245,245,245,0.3)",
            textTransform: "uppercase",
          }}
        >
          {artwork.title}
        </span>
      </div>

      {/* Hover-reveal info overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background:
            "linear-gradient(to top, rgba(8,8,8,0.97) 0%, rgba(8,8,8,0.88) 55%, transparent 100%)",
          padding: showPrintPicker ? "60px 60px 36px" : "100px 60px 36px",
          opacity: showInfo || showPrintPicker ? 1 : 0,
          transform: showInfo || showPrintPicker ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.35s ease, transform 0.35s ease, padding 0.3s ease",
          pointerEvents: showInfo || showPrintPicker ? "auto" : "none",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "40px",
          zIndex: 10,
        }}
        onMouseEnter={cancelHide}
        onMouseLeave={showPrintPicker ? undefined : handleMouseLeave}
      >
        {/* Left: artwork details */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "30px",
              fontWeight: 300,
              color: "#f5f5f5",
              margin: "0 0 10px",
              letterSpacing: "0.03em",
              lineHeight: 1.1,
            }}
          >
            {artwork.title}
          </h2>
          <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
            {artwork.year && (
              <span style={{ fontFamily: "'Inter'", fontSize: "12px", color: "#666", letterSpacing: "0.06em" }}>
                {artwork.year}
              </span>
            )}
            {artwork.medium && (
              <span style={{ fontFamily: "'Inter'", fontSize: "12px", color: "#666", letterSpacing: "0.04em" }}>
                {artwork.medium}
              </span>
            )}
            {artwork.dimensions && (
              <span style={{ fontFamily: "'Inter'", fontSize: "12px", color: "#555", letterSpacing: "0.04em" }}>
                {artwork.dimensions}
              </span>
            )}
          </div>
          {artwork.description && !showPrintPicker && (
            <p
              style={{
                fontFamily: "'Inter'",
                fontSize: "13px",
                color: "#555",
                margin: "10px 0 0",
                maxWidth: "480px",
                lineHeight: 1.65,
              }}
            >
              {artwork.description}
            </p>
          )}
        </div>

        {/* Right: price + purchase / print picker */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "14px",
            flexShrink: 0,
          }}
        >
          {!showPrintPicker ? (
            <>
              {/* Normal state */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {isAvailable && artwork.price && (
                  <span
                    style={{
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: "26px",
                      fontWeight: 300,
                      color: "#f5f5f5",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {formatPrice(artwork.price)}
                  </span>
                )}
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: "3px",
                    fontSize: "10px",
                    fontFamily: "'Inter'",
                    fontWeight: 500,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    background: isAvailable ? "rgba(74, 222, 128, 0.1)" : "rgba(82,82,82,0.2)",
                    color: isAvailable ? "#4ade80" : "#666",
                    border: `1px solid ${isAvailable ? "rgba(74,222,128,0.25)" : "rgba(82,82,82,0.3)"}`,
                  }}
                >
                  {artwork.status === "sold" ? "Sold" : artwork.status === "available" ? "Available" : "Not for sale"}
                </span>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                {isAvailable && artwork.price && (
                  <button
                    onClick={handleBuyOriginal}
                    disabled={checkoutMutation.isPending}
                    style={{
                      padding: "10px 22px",
                      background: "#f5f5f5",
                      color: "#080808",
                      border: "none",
                      borderRadius: "3px",
                      fontFamily: "'Inter'",
                      fontSize: "11px",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      cursor: checkoutMutation.isPending ? "not-allowed" : "pointer",
                      opacity: checkoutMutation.isPending ? 0.6 : 1,
                      transition: "opacity 0.2s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {checkoutMutation.isPending ? "Loading…" : "Buy Original"}
                  </button>
                )}
                <button
                  onClick={() => {
                    cancelHide();
                    setShowPrintPicker(true);
                    setShowInfo(true);
                  }}
                  disabled={checkoutMutation.isPending}
                  style={{
                    padding: "10px 22px",
                    background: "transparent",
                    color: "rgba(245,245,245,0.7)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "3px",
                    fontFamily: "'Inter'",
                    fontSize: "11px",
                    fontWeight: 400,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: checkoutMutation.isPending ? "not-allowed" : "pointer",
                    opacity: checkoutMutation.isPending ? 0.6 : 1,
                    transition: "all 0.2s",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.4)";
                    (e.target as HTMLElement).style.color = "#f5f5f5";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)";
                    (e.target as HTMLElement).style.color = "rgba(245,245,245,0.7)";
                  }}
                >
                  Buy Print
                </button>
              </div>
            </>
          ) : (
            /* Print picker */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "16px",
                minWidth: "280px",
              }}
            >
              {/* Type selector */}
              <div style={{ width: "100%" }}>
                <div
                  style={{
                    fontFamily: "'Inter'",
                    fontSize: "9px",
                    letterSpacing: "0.16em",
                    color: "#555",
                    textTransform: "uppercase",
                    marginBottom: "8px",
                  }}
                >
                  Print Type
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  {(["matte", "framed"] as PrintType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedPrintType(type)}
                      style={{
                        padding: "8px 12px",
                        background: selectedPrintType === type ? "rgba(245,245,245,0.08)" : "transparent",
                        border: `1px solid ${selectedPrintType === type ? "rgba(245,245,245,0.35)" : "rgba(255,255,255,0.1)"}`,
                        borderRadius: "3px",
                        color: selectedPrintType === type ? "#f5f5f5" : "#666",
                        fontFamily: "'Inter'",
                        fontSize: "10px",
                        fontWeight: selectedPrintType === type ? 500 : 400,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        textAlign: "center",
                      }}
                    >
                      {type === "matte" ? "Matte" : "Framed"}
                    </button>
                  ))}
                </div>
                {selectedPrintType === "matte" && (
                  <div style={{ fontFamily: "'Inter'", fontSize: "10px", color: "#444", marginTop: "5px", letterSpacing: "0.03em" }}>
                    Enhanced matte paper, 210gsm
                  </div>
                )}
                {selectedPrintType === "framed" && (
                  <div style={{ fontFamily: "'Inter'", fontSize: "10px", color: "#444", marginTop: "5px", letterSpacing: "0.03em" }}>
                    Black frame, white mat, museum glass
                  </div>
                )}
              </div>

              {/* Size selector */}
              <div style={{ width: "100%" }}>
                <div
                  style={{
                    fontFamily: "'Inter'",
                    fontSize: "9px",
                    letterSpacing: "0.16em",
                    color: "#555",
                    textTransform: "uppercase",
                    marginBottom: "8px",
                  }}
                >
                  Size
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  {PRINT_SIZES.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedPrintSize(size)}
                      style={{
                        padding: "8px 10px",
                        background: selectedPrintSize === size ? "rgba(245,245,245,0.08)" : "transparent",
                        border: `1px solid ${selectedPrintSize === size ? "rgba(245,245,245,0.35)" : "rgba(255,255,255,0.1)"}`,
                        borderRadius: "3px",
                        color: selectedPrintSize === size ? "#f5f5f5" : "#666",
                        fontFamily: "'Inter'",
                        fontSize: "10px",
                        fontWeight: selectedPrintSize === size ? 500 : 400,
                        letterSpacing: "0.06em",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "2px",
                      }}
                    >
                      <span>{SIZE_LABELS[size]}</span>
                      <span style={{ fontSize: "9px", opacity: 0.6 }}>
                        ${PRINT_PRICES[selectedPrintType][size]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Checkout row */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center", width: "100%", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowPrintPicker(false)}
                  style={{
                    padding: "9px 16px",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "3px",
                    color: "#555",
                    fontFamily: "'Inter'",
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.color = "#888";
                    (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.color = "#555";
                    (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleBuyPrint}
                  disabled={checkoutMutation.isPending}
                  style={{
                    padding: "9px 22px",
                    background: "#f5f5f5",
                    color: "#080808",
                    border: "none",
                    borderRadius: "3px",
                    fontFamily: "'Inter'",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: checkoutMutation.isPending ? "not-allowed" : "pointer",
                    opacity: checkoutMutation.isPending ? 0.6 : 1,
                    transition: "opacity 0.2s",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {checkoutMutation.isPending
                    ? "Loading…"
                    : `Checkout — $${selectedPrice}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation arrows */}
      {!showPrintPicker && currentIndex > 0 && (
        <button
          onClick={() => onNavigate(currentIndex - 1)}
          style={{
            position: "absolute",
            left: "20px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.2)",
            width: "48px",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "32px",
            transition: "color 0.2s",
            zIndex: 20,
          }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.8)")}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.2)")}
        >
          ‹
        </button>
      )}
      {!showPrintPicker && currentIndex < artworks.length - 1 && (
        <button
          onClick={() => onNavigate(currentIndex + 1)}
          style={{
            position: "absolute",
            right: "20px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.2)",
            width: "48px",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "32px",
            transition: "color 0.2s",
            zIndex: 20,
          }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.8)")}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.2)")}
        >
          ›
        </button>
      )}
    </div>
  );
}
