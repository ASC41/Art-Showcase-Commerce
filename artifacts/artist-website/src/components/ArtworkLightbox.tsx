import { useState, useEffect, useCallback, useRef } from "react";
import { useCreateCheckoutSession } from "@workspace/api-client-react";
import type { Artwork, PrintType, PrintSize } from "@workspace/api-client-react";
import { ARTWORK_ASPECT, ARTWORK_ROTATION } from "@/lib/artworkDimensions";

interface Props {
  artworks: Artwork[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const PRINT_SIZES: PrintSize[] = ["11x14", "18x24", "24x36"];

const SIZE_LABELS_PORTRAIT: Record<PrintSize, string> = {
  "11x14": '11" × 14"',
  "18x24": '18" × 24"',
  "24x36": '24" × 36"',
};

const SIZE_LABELS_LANDSCAPE: Record<PrintSize, string> = {
  "11x14": '14" × 11"',
  "18x24": '24" × 18"',
  "24x36": '36" × 24"',
};

const PRINT_PRICES: Record<PrintType, Record<PrintSize, number>> = {
  matte:  { "11x14": 45, "18x24": 65, "24x36": 95 },
  framed: { "11x14": 85, "18x24": 115, "24x36": 165 },
};

export default function ArtworkLightbox({ artworks, currentIndex, onClose, onNavigate }: Props) {
  const artwork = artworks[currentIndex];
  const isLandscape = artwork?.imageOrientation === "landscape";
  const SIZE_LABELS = isLandscape ? SIZE_LABELS_LANDSCAPE : SIZE_LABELS_PORTRAIT;
  const checkoutMutation = useCreateCheckoutSession();
  const [showInfo, setShowInfo] = useState(false);
  const [showPrintPicker, setShowPrintPicker] = useState(false);
  const [pickerStep, setPickerStep] = useState<1 | 2>(1);
  const [selectedPrintType, setSelectedPrintType] = useState<PrintType>("matte");
  const [selectedPrintSize, setSelectedPrintSize] = useState<PrintSize>("18x24");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showPrintPicker && pickerStep === 2) {
          setPickerStep(1);
        } else if (showPrintPicker) {
          setShowPrintPicker(false);
          setPickerStep(1);
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
    [currentIndex, artworks.length, onClose, onNavigate, showPrintPicker, pickerStep]
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

  const rotation = ARTWORK_ROTATION[artwork.slug];

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
  const hasPrints = artwork.hasMattePrint || artwork.hasFramedPrint;

  // When picker opens, default to the first available print type
  const handleOpenPicker = () => {
    cancelHide();
    if (!artwork.hasMattePrint && artwork.hasFramedPrint) {
      setSelectedPrintType("framed");
    } else {
      setSelectedPrintType("matte");
    }
    setPickerStep(1);
    setShowPrintPicker(true);
    setShowInfo(true);
  };

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
        {rotation !== undefined ? (
          // Wrapper sized to the DISPLAYED (landscape) aspect ratio so the
          // browser constrains the visual dimensions correctly. The source
          // image is portrait; after rotate(Ndeg) it fills this landscape box.
          <div
            style={{
              position: "relative",
              // aspect-ratio = display width / display height = 1/ar (landscape)
              aspectRatio: `${1 / (ARTWORK_ASPECT[artwork.slug] ?? 1)}`,
              maxWidth: "100%",
              maxHeight: "100%",
              overflow: "hidden",
            }}
          >
            <img
              src={artwork.imageUrl}
              alt={artwork.title}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: "100%",
                height: "auto",
                transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${ARTWORK_ASPECT[artwork.slug] ?? 1})`,
                transformOrigin: "center center",
                display: "block",
              }}
            />
          </div>
        ) : (
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
        )}
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
                {hasPrints && (
                  <button
                    onClick={handleOpenPicker}
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
                )}
              </div>
            </>
          ) : pickerStep === 1 ? (
            /* Step 1 — Select type + size */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "16px",
                minWidth: "290px",
              }}
            >
              {/* Step indicator */}
              <div style={{ fontFamily: "'Inter'", fontSize: "9px", color: "#444", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Step 1 of 2 — Choose options
              </div>

              {/* Type selector */}
              <div style={{ width: "100%" }}>
                <div style={{ fontFamily: "'Inter'", fontSize: "9px", letterSpacing: "0.16em", color: "#555", textTransform: "uppercase", marginBottom: "8px" }}>
                  Print Type
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  {(["matte", "framed"] as PrintType[]).map((type) => {
                    const typeAvailable = type === "matte" ? artwork.hasMattePrint : artwork.hasFramedPrint;
                    const isSelected = selectedPrintType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => typeAvailable && setSelectedPrintType(type)}
                        disabled={!typeAvailable}
                        title={!typeAvailable ? "Not available for this artwork" : undefined}
                        style={{
                          padding: "8px 12px",
                          background: isSelected ? "rgba(245,245,245,0.08)" : "transparent",
                          border: `1px solid ${isSelected ? "rgba(245,245,245,0.35)" : "rgba(255,255,255,0.1)"}`,
                          borderRadius: "3px",
                          color: !typeAvailable ? "#333" : isSelected ? "#f5f5f5" : "#666",
                          fontFamily: "'Inter'",
                          fontSize: "10px",
                          fontWeight: isSelected ? 500 : 400,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          cursor: !typeAvailable ? "not-allowed" : "pointer",
                          opacity: !typeAvailable ? 0.4 : 1,
                          transition: "all 0.15s",
                          textAlign: "center",
                        }}
                      >
                        {type === "matte" ? "Matte" : "Framed"}
                        {!typeAvailable && (
                          <span style={{ display: "block", fontSize: "8px", opacity: 0.6, marginTop: "1px" }}>Unavailable</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontFamily: "'Inter'", fontSize: "10px", color: "#444", marginTop: "5px", letterSpacing: "0.03em" }}>
                  {selectedPrintType === "matte" ? "Enhanced matte paper, 210gsm" : "Black frame, white mat, museum glass"}
                </div>
              </div>

              {/* Size selector */}
              <div style={{ width: "100%" }}>
                <div style={{ fontFamily: "'Inter'", fontSize: "9px", letterSpacing: "0.16em", color: "#555", textTransform: "uppercase", marginBottom: "8px" }}>
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
                      <span style={{ fontSize: "9px", opacity: 0.6 }}>${PRINT_PRICES[selectedPrintType][size]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 1 action row */}
              <div style={{ display: "flex", gap: "8px", width: "100%", justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setShowPrintPicker(false); setPickerStep(1); }}
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
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#888"; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#555"; }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => setPickerStep(2)}
                  style={{
                    padding: "9px 22px",
                    background: "rgba(245,245,245,0.08)",
                    color: "#f5f5f5",
                    border: "1px solid rgba(245,245,245,0.2)",
                    borderRadius: "3px",
                    fontFamily: "'Inter'",
                    fontSize: "11px",
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = "rgba(245,245,245,0.14)";
                    (e.target as HTMLElement).style.borderColor = "rgba(245,245,245,0.35)";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = "rgba(245,245,245,0.08)";
                    (e.target as HTMLElement).style.borderColor = "rgba(245,245,245,0.2)";
                  }}
                >
                  Review Order →
                </button>
              </div>
            </div>
          ) : (
            /* Step 2 — Order summary + confirm */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "18px",
                minWidth: "290px",
              }}
            >
              {/* Step indicator */}
              <div style={{ fontFamily: "'Inter'", fontSize: "9px", color: "#444", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Step 2 of 2 — Confirm &amp; purchase
              </div>

              {/* Order summary card */}
              <div
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  padding: "16px",
                  background: "rgba(245,245,245,0.03)",
                }}
              >
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "17px", color: "#f5f5f5", marginBottom: "14px", fontWeight: 300, letterSpacing: "0.02em" }}>
                  {artwork.title}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Inter'", fontSize: "10px", color: "#555", letterSpacing: "0.06em", textTransform: "uppercase" }}>Type</span>
                    <span style={{ fontFamily: "'Inter'", fontSize: "11px", color: "#ccc" }}>
                      {selectedPrintType === "matte" ? "Enhanced Matte Print" : "Framed Print"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Inter'", fontSize: "10px", color: "#555", letterSpacing: "0.06em", textTransform: "uppercase" }}>Size</span>
                    <span style={{ fontFamily: "'Inter'", fontSize: "11px", color: "#ccc" }}>{SIZE_LABELS[selectedPrintSize]}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ fontFamily: "'Inter'", fontSize: "10px", color: "#555", letterSpacing: "0.06em", textTransform: "uppercase" }}>Total</span>
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", color: "#f5f5f5", fontWeight: 300 }}>
                      ${selectedPrice}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ fontFamily: "'Inter'", fontSize: "10px", color: "#444", letterSpacing: "0.03em", textAlign: "right" }}>
                Free shipping · Printed to order · Ships in 5–7 days
              </div>

              {/* Step 2 action row */}
              <div style={{ display: "flex", gap: "8px", width: "100%", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setPickerStep(1)}
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
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#888"; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#555"; }}
                >
                  ← Back
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
                  {checkoutMutation.isPending ? "Loading…" : "Proceed to Checkout"}
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
