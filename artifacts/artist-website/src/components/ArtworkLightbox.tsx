import { useState, useEffect, useCallback, useRef } from "react";
import { useCreateCheckoutSession } from "@workspace/api-client-react";
import type { Artwork, PrintSize } from "@workspace/api-client-react";
import { ARTWORK_ASPECT, ARTWORK_ROTATION } from "@/lib/artworkDimensions";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  artworks: Artwork[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const PRINT_SIZES: PrintSize[] = ["8x10", "12x18", "16x20"];

const SIZE_LABELS_PORTRAIT: Record<PrintSize, string> = {
  "8x10":  '8" × 10"',
  "12x18": '12" × 18"',
  "16x20": '16" × 20"',
};

const SIZE_LABELS_LANDSCAPE: Record<PrintSize, string> = {
  "8x10":  '10" × 8"',
  "12x18": '18" × 12"',
  "16x20": '20" × 16"',
};

const PRINT_PRICES: Record<PrintSize, number> = {
  "8x10":  45,
  "12x18": 75,
  "16x20": 95,
};

const DESC_THRESHOLD = 110;

export default function ArtworkLightbox({ artworks, currentIndex, onClose, onNavigate }: Props) {
  const artwork = artworks[currentIndex];
  const isLandscape = artwork?.imageOrientation === "landscape";
  const SIZE_LABELS = isLandscape ? SIZE_LABELS_LANDSCAPE : SIZE_LABELS_PORTRAIT;
  const checkoutMutation = useCreateCheckoutSession();
  const isMobile = useIsMobile();

  // Desktop: hover-reveal state
  const [showInfo, setShowInfo] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared: print picker
  const [showPrintPicker, setShowPrintPicker] = useState(false);
  const [selectedPrintSize, setSelectedPrintSize] = useState<PrintSize>("8x10");

  // Mobile-only: bottom sheet expanded state + description expanded
  const [sheetOpen, setSheetOpen] = useState(true);
  const [descExpanded, setDescExpanded] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showPrintPicker) {
          setShowPrintPicker(false);
        } else if (sheetOpen) {
          setSheetOpen(false);
        } else {
          onClose();
        }
      }
      if (!showPrintPicker && !sheetOpen) {
        if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
        if (e.key === "ArrowRight" && currentIndex < artworks.length - 1)
          onNavigate(currentIndex + 1);
      }
    },
    [currentIndex, artworks.length, onClose, onNavigate, showPrintPicker, sheetOpen]
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
    setSheetOpen(true);
    setDescExpanded(false);
  }, [currentIndex]);

  const formatPrice = (cents: number | null | undefined) => {
    if (!cents) return "—";
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

  const handleReviewOrder = () => {
    const params = new URLSearchParams({
      product: "giclee-print",
      artwork: artwork.slug,
      size: selectedPrintSize,
    });
    window.location.href = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/merch?${params.toString()}`;
  };

  if (!artwork) return null;

  const rotation = ARTWORK_ROTATION[artwork.slug];
  const isAvailable = artwork.status === "available";
  const hasPrints = artwork.hasMattePrint;
  const hasLongDesc = (artwork.description?.length ?? 0) > DESC_THRESHOLD;

  // ── Desktop hover helpers ──────────────────────────────────────────────────
  const handleOpenPicker = () => {
    cancelHide();
    setShowPrintPicker(true);
    setShowInfo(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile || showPrintPicker) return;
    const threshold = e.currentTarget.getBoundingClientRect().height * 0.65;
    const relativeY = e.clientY - e.currentTarget.getBoundingClientRect().top;
    if (relativeY > threshold) {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
      setShowInfo(true);
    } else {
      if (!hideTimerRef.current) {
        hideTimerRef.current = setTimeout(() => { setShowInfo(false); hideTimerRef.current = null; }, 300);
      }
    }
  };

  const handleMouseLeave = () => {
    if (isMobile || showPrintPicker) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => { setShowInfo(false); hideTimerRef.current = null; }, 200);
  };

  const cancelHide = () => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  };

  // ── Shared image ───────────────────────────────────────────────────────────
  // For rotated artworks the wrapper must have an explicit width — its only child
  // is position:absolute (out of flow) so without a width the div collapses to 0×0.
  const displayAr = 1 / (ARTWORK_ASPECT[artwork.slug] ?? 1);
  const image = rotation !== undefined ? (
    <div style={{
      position: "relative",
      aspectRatio: `${displayAr}`,
      width: `min(90vw, calc(85vh * ${displayAr.toFixed(4)}))`,
      overflow: "hidden",
    }}>
      <img
        src={artwork.imageUrl}
        alt={artwork.title}
        style={{
          position: "absolute",
          top: "50%", left: "50%",
          width: "100%", height: "auto",
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
      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
    />
  );

  // ── Navigation arrows (shared) ─────────────────────────────────────────────
  const navArrows = !showPrintPicker && (
    <>
      {currentIndex > 0 && (
        <button
          onClick={() => onNavigate(currentIndex - 1)}
          style={{
            position: "absolute",
            left: isMobile ? "8px" : "20px",
            top: isMobile ? "45%" : "50%",
            transform: "translateY(-50%)",
            background: "rgba(8,8,8,0.45)",
            border: "none",
            color: "rgba(255,255,255,0.55)",
            width: isMobile ? "40px" : "48px",
            height: isMobile ? "40px" : "48px",
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            fontSize: isMobile ? "26px" : "32px",
            zIndex: 20,
          }}
        >‹</button>
      )}
      {currentIndex < artworks.length - 1 && (
        <button
          onClick={() => onNavigate(currentIndex + 1)}
          style={{
            position: "absolute",
            right: isMobile ? "8px" : "20px",
            top: isMobile ? "45%" : "50%",
            transform: "translateY(-50%)",
            background: "rgba(8,8,8,0.45)",
            border: "none",
            color: "rgba(255,255,255,0.55)",
            width: isMobile ? "40px" : "48px",
            height: isMobile ? "40px" : "48px",
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            fontSize: isMobile ? "26px" : "32px",
            zIndex: 20,
          }}
        >›</button>
      )}
    </>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT
  // ══════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "#080808", display: "flex", flexDirection: "column" }}>
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: "16px", right: "16px",
            background: "rgba(8,8,8,0.6)", border: "none",
            color: "rgba(255,255,255,0.5)", fontSize: "26px",
            cursor: "pointer", zIndex: 30, lineHeight: 1,
            padding: "6px 10px", borderRadius: "50%",
          }}
        >×</button>

        {/* Image area — tapping backdrop closes sheet */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: sheetOpen ? "48px 24px 0" : "48px 16px 0",
            transition: "padding 0.3s ease",
            minHeight: 0,
          }}
          onClick={() => { if (sheetOpen) setSheetOpen(false); }}
        >
          {image}
        </div>

        {navArrows}

        {/* ── Bottom sheet ── */}
        <div
          style={{
            background: "linear-gradient(to top, #080808 70%, rgba(8,8,8,0.0) 100%)",
            borderTop: sheetOpen ? "1px solid rgba(255,255,255,0.06)" : "none",
            transition: "border-color 0.3s",
            zIndex: 20,
            flexShrink: 0,
          }}
        >
          {/* Collapsed strip — title + handle to expand */}
          {!sheetOpen && (
            <button
              onClick={() => setSheetOpen(true)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "18px 20px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                textAlign: "left",
                gap: "12px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "22px",
                  fontWeight: 300,
                  color: "#f5f5f5",
                  letterSpacing: "0.03em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {artwork.title}
                </div>
                <div style={{ display: "flex", gap: "10px", marginTop: "4px", alignItems: "center" }}>
                  {artwork.year && (
                    <span style={{ fontFamily: "'Inter'", fontSize: "11px", color: "#555" }}>{artwork.year}</span>
                  )}
                  <span style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: "3px",
                    fontSize: "9px", fontFamily: "'Inter'", fontWeight: 500,
                    letterSpacing: "0.1em", textTransform: "uppercase" as const,
                    background: isAvailable ? "rgba(74,222,128,0.1)" : "rgba(82,82,82,0.2)",
                    color: isAvailable ? "#4ade80" : "#666",
                    border: `1px solid ${isAvailable ? "rgba(74,222,128,0.25)" : "rgba(82,82,82,0.3)"}`,
                  }}>
                    {artwork.status === "sold" ? "Sold" : artwork.status === "available" ? "Available" : "—"}
                  </span>
                </div>
              </div>
              {/* Chevron up hint */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, opacity: 0.35 }}>
                <path d="M4 11.5L9 6.5L14 11.5" stroke="#f5f5f5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}

          {/* Expanded sheet */}
          {sheetOpen && (
            <div style={{ padding: "0 20px 32px", maxHeight: "72vh", overflowY: "auto" }}>
              {/* Handle bar + collapse */}
              <button
                onClick={() => setSheetOpen(false)}
                style={{
                  width: "100%", background: "transparent", border: "none",
                  cursor: "pointer", paddingTop: "14px", paddingBottom: "14px",
                  display: "flex", justifyContent: "center",
                }}
              >
                <div style={{ width: "36px", height: "3px", borderRadius: "2px", background: "rgba(255,255,255,0.15)" }} />
              </button>

              {/* Title */}
              <h2 style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "26px", fontWeight: 300, color: "#f5f5f5",
                margin: "0 0 10px", letterSpacing: "0.03em", lineHeight: 1.15,
              }}>
                {artwork.title}
              </h2>

              {/* Meta row */}
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" as const, alignItems: "center", marginBottom: "14px" }}>
                {artwork.year && (
                  <span style={{ fontFamily: "'Inter'", fontSize: "12px", color: "#666" }}>{artwork.year}</span>
                )}
                {artwork.medium && (
                  <span style={{ fontFamily: "'Inter'", fontSize: "12px", color: "#555" }}>{artwork.medium}</span>
                )}
                {artwork.dimensions && (
                  <span style={{ fontFamily: "'Inter'", fontSize: "12px", color: "#444" }}>{artwork.dimensions}</span>
                )}
                <span style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: "3px",
                  fontSize: "9px", fontFamily: "'Inter'", fontWeight: 500,
                  letterSpacing: "0.1em", textTransform: "uppercase" as const,
                  background: isAvailable ? "rgba(74,222,128,0.1)" : "rgba(82,82,82,0.2)",
                  color: isAvailable ? "#4ade80" : "#666",
                  border: `1px solid ${isAvailable ? "rgba(74,222,128,0.25)" : "rgba(82,82,82,0.3)"}`,
                }}>
                  {artwork.status === "sold" ? "Sold" : artwork.status === "available" ? "Available" : "Not for sale"}
                </span>
              </div>

              {/* Description */}
              {artwork.description && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{
                    fontFamily: "'Inter'",
                    fontSize: "13px",
                    color: "#666",
                    lineHeight: 1.7,
                    overflow: "hidden",
                    maxHeight: descExpanded || !hasLongDesc ? "none" : "4.8em",
                    transition: "max-height 0.35s ease",
                    position: "relative",
                  }}>
                    {artwork.description}
                    {!descExpanded && hasLongDesc && (
                      <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        height: "2.4em",
                        background: "linear-gradient(to top, #080808 20%, transparent 100%)",
                      }} />
                    )}
                  </div>
                  {hasLongDesc && (
                    <button
                      onClick={() => setDescExpanded(v => !v)}
                      style={{
                        background: "transparent", border: "none", padding: "6px 0 0",
                        fontFamily: "'Inter'", fontSize: "11px", color: "#555",
                        letterSpacing: "0.06em", cursor: "pointer",
                        textDecoration: "underline", textUnderlineOffset: "3px",
                      }}
                    >
                      {descExpanded ? "Show less" : "Read more"}
                    </button>
                  )}
                </div>
              )}

              {/* Divider */}
              <div style={{ height: "1px", background: "rgba(255,255,255,0.05)", margin: "4px 0 18px" }} />

              {/* Price + Buy */}
              {!showPrintPicker ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: "12px" }}>
                  <span style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: "24px", fontWeight: 300, color: artwork.price ? "#f5f5f5" : "#444",
                  }}>
                    {formatPrice(artwork.price)}
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {isAvailable && artwork.price && (
                      <button
                        onClick={handleBuyOriginal}
                        disabled={checkoutMutation.isPending}
                        style={{
                          padding: "10px 20px", background: "#f5f5f5", color: "#080808",
                          border: "none", borderRadius: "3px", fontFamily: "'Inter'",
                          fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em",
                          textTransform: "uppercase" as const, cursor: "pointer",
                          opacity: checkoutMutation.isPending ? 0.6 : 1,
                        }}
                      >
                        {checkoutMutation.isPending ? "…" : "Buy Original"}
                      </button>
                    )}
                    {hasPrints && (
                      <button
                        onClick={() => setShowPrintPicker(true)}
                        style={{
                          padding: "10px 20px", background: "transparent", color: "rgba(245,245,245,0.7)",
                          border: "1px solid rgba(255,255,255,0.15)", borderRadius: "3px",
                          fontFamily: "'Inter'", fontSize: "11px", letterSpacing: "0.08em",
                          textTransform: "uppercase" as const, cursor: "pointer",
                        }}
                      >
                        Buy Print
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Print picker — mobile */
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <div style={{ fontFamily: "'Inter'", fontSize: "9px", letterSpacing: "0.16em", color: "#555", textTransform: "uppercase" as const, marginBottom: "4px" }}>Print Type</div>
                    <div style={{ fontFamily: "'Inter'", fontSize: "12px", color: "#aaa" }}>Fine Art Print</div>
                    <div style={{ fontFamily: "'Inter'", fontSize: "10px", color: "#444", marginTop: "2px" }}>Archival pigment inks · 220gsm gallery-grade paper</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Inter'", fontSize: "9px", letterSpacing: "0.16em", color: "#555", textTransform: "uppercase" as const, marginBottom: "8px" }}>Size</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                      {PRINT_SIZES.map((size) => (
                        <button
                          key={size}
                          onClick={() => setSelectedPrintSize(size)}
                          style={{
                            padding: "10px 6px",
                            background: selectedPrintSize === size ? "rgba(245,245,245,0.08)" : "transparent",
                            border: `1px solid ${selectedPrintSize === size ? "rgba(245,245,245,0.35)" : "rgba(255,255,255,0.1)"}`,
                            borderRadius: "3px",
                            color: selectedPrintSize === size ? "#f5f5f5" : "#666",
                            fontFamily: "'Inter'", fontSize: "10px",
                            fontWeight: selectedPrintSize === size ? 500 : 400,
                            letterSpacing: "0.04em",
                            cursor: "pointer",
                            display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
                          }}
                        >
                          <span>{SIZE_LABELS[size]}</span>
                          <span style={{ fontSize: "9px", opacity: 0.6 }}>${PRINT_PRICES[size]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => setShowPrintPicker(false)}
                      style={{
                        flex: 1, padding: "11px", background: "transparent",
                        border: "1px solid rgba(255,255,255,0.08)", borderRadius: "3px",
                        color: "#555", fontFamily: "'Inter'", fontSize: "11px",
                        letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer",
                      }}
                    >Cancel</button>
                    <button
                      onClick={handleReviewOrder}
                      style={{
                        flex: 2, padding: "11px", background: "rgba(245,245,245,0.08)",
                        color: "#f5f5f5", border: "1px solid rgba(245,245,245,0.2)",
                        borderRadius: "3px", fontFamily: "'Inter'", fontSize: "11px",
                        fontWeight: 500, letterSpacing: "0.08em",
                        textTransform: "uppercase" as const, cursor: "pointer",
                      }}
                    >Review Order →</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DESKTOP LAYOUT (unchanged interaction model)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(8,8,8,0.97)" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Image */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "60px 80px",
      }}>
        {image}
      </div>

      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: "24px", right: "28px",
          background: "transparent", border: "none",
          color: "rgba(255,255,255,0.35)", fontSize: "28px",
          cursor: "pointer", zIndex: 20, lineHeight: 1, padding: "8px",
          transition: "color 0.2s",
        }}
        onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#f5f5f5")}
        onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.35)")}
      >×</button>

      {/* Idle title hint */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "72px",
        background: "linear-gradient(to top, rgba(8,8,8,0.6) 0%, transparent 100%)",
        display: "flex", alignItems: "flex-end", padding: "0 60px 18px",
        pointerEvents: "none",
        opacity: showInfo || showPrintPicker ? 0 : 1,
        transition: "opacity 0.3s",
      }}>
        <span style={{
          fontFamily: "'Cormorant Garamond', serif", fontSize: "13px",
          letterSpacing: "0.14em", color: "rgba(245,245,245,0.3)", textTransform: "uppercase",
        }}>
          {artwork.title}
        </span>
      </div>

      {/* Hover info overlay */}
      <div
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          background: "linear-gradient(to top, rgba(8,8,8,0.97) 0%, rgba(8,8,8,0.88) 55%, transparent 100%)",
          padding: showPrintPicker ? "60px 60px 36px" : "100px 60px 36px",
          opacity: showInfo || showPrintPicker ? 1 : 0,
          transform: showInfo || showPrintPicker ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.35s ease, transform 0.35s ease, padding 0.3s ease",
          pointerEvents: showInfo || showPrintPicker ? "auto" : "none",
          display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          gap: "40px", zIndex: 10,
        }}
        onMouseEnter={cancelHide}
        onMouseLeave={showPrintPicker ? undefined : handleMouseLeave}
      >
        {/* Left: details */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{
            fontFamily: "'Cormorant Garamond', serif", fontSize: "30px",
            fontWeight: 300, color: "#f5f5f5", margin: "0 0 10px",
            letterSpacing: "0.03em", lineHeight: 1.1,
          }}>
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
            <p style={{
              fontFamily: "'Inter'", fontSize: "13px", color: "#555",
              margin: "10px 0 0", maxWidth: "480px", lineHeight: 1.65,
            }}>
              {artwork.description}
            </p>
          )}
        </div>

        {/* Right: price / picker */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "14px", flexShrink: 0 }}>
          {!showPrintPicker ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{
                  fontFamily: "'Cormorant Garamond', serif", fontSize: "26px",
                  fontWeight: 300, color: artwork.price ? "#f5f5f5" : "#555", letterSpacing: "0.02em",
                }}>
                  {formatPrice(artwork.price)}
                </span>
                <span style={{
                  display: "inline-block", padding: "3px 10px", borderRadius: "3px",
                  fontSize: "10px", fontFamily: "'Inter'", fontWeight: 500,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  background: isAvailable ? "rgba(74, 222, 128, 0.1)" : "rgba(82,82,82,0.2)",
                  color: isAvailable ? "#4ade80" : "#666",
                  border: `1px solid ${isAvailable ? "rgba(74,222,128,0.25)" : "rgba(82,82,82,0.3)"}`,
                }}>
                  {artwork.status === "sold" ? "Sold" : artwork.status === "available" ? "Available" : "Not for sale"}
                </span>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                {isAvailable && artwork.price && (
                  <button
                    onClick={handleBuyOriginal}
                    disabled={checkoutMutation.isPending}
                    style={{
                      padding: "10px 22px", background: "#f5f5f5", color: "#080808",
                      border: "none", borderRadius: "3px", fontFamily: "'Inter'",
                      fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em",
                      textTransform: "uppercase", cursor: checkoutMutation.isPending ? "not-allowed" : "pointer",
                      opacity: checkoutMutation.isPending ? 0.6 : 1, whiteSpace: "nowrap",
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
                      padding: "10px 22px", background: "transparent", color: "rgba(245,245,245,0.7)",
                      border: "1px solid rgba(255,255,255,0.15)", borderRadius: "3px",
                      fontFamily: "'Inter'", fontSize: "11px", fontWeight: 400,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      cursor: checkoutMutation.isPending ? "not-allowed" : "pointer",
                      opacity: checkoutMutation.isPending ? 0.6 : 1, whiteSpace: "nowrap",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.4)"; (e.target as HTMLElement).style.color = "#f5f5f5"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)"; (e.target as HTMLElement).style.color = "rgba(245,245,245,0.7)"; }}
                  >
                    Buy Print
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "16px", minWidth: "290px" }}>
              <div style={{ width: "100%" }}>
                <div style={{ fontFamily: "'Inter'", fontSize: "9px", letterSpacing: "0.16em", color: "#555", textTransform: "uppercase", marginBottom: "6px" }}>Print Type</div>
                <div style={{ fontFamily: "'Inter'", fontSize: "11px", color: "#aaa", letterSpacing: "0.04em" }}>Fine Art Print</div>
                <div style={{ fontFamily: "'Inter'", fontSize: "10px", color: "#444", marginTop: "3px" }}>Archival pigment inks · 220gsm gallery-grade paper</div>
              </div>
              <div style={{ width: "100%" }}>
                <div style={{ fontFamily: "'Inter'", fontSize: "9px", letterSpacing: "0.16em", color: "#555", textTransform: "uppercase", marginBottom: "8px" }}>Size</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  {PRINT_SIZES.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedPrintSize(size)}
                      style={{
                        padding: "8px 10px",
                        background: selectedPrintSize === size ? "rgba(245,245,245,0.08)" : "transparent",
                        border: `1px solid ${selectedPrintSize === size ? "rgba(245,245,245,0.35)" : "rgba(255,255,255,0.1)"}`,
                        borderRadius: "3px", color: selectedPrintSize === size ? "#f5f5f5" : "#666",
                        fontFamily: "'Inter'", fontSize: "10px",
                        fontWeight: selectedPrintSize === size ? 500 : 400,
                        letterSpacing: "0.06em", cursor: "pointer", transition: "all 0.15s",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
                      }}
                    >
                      <span>{SIZE_LABELS[size]}</span>
                      <span style={{ fontSize: "9px", opacity: 0.6 }}>${PRINT_PRICES[size]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", width: "100%", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowPrintPicker(false)}
                  style={{
                    padding: "9px 16px", background: "transparent",
                    border: "1px solid rgba(255,255,255,0.08)", borderRadius: "3px",
                    color: "#555", fontFamily: "'Inter'", fontSize: "10px",
                    letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#888"; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#555"; }}
                >Cancel</button>
                <button
                  onClick={handleReviewOrder}
                  style={{
                    padding: "9px 22px", background: "rgba(245,245,245,0.08)",
                    color: "#f5f5f5", border: "1px solid rgba(245,245,245,0.2)",
                    borderRadius: "3px", fontFamily: "'Inter'", fontSize: "11px",
                    fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
                    cursor: "pointer", whiteSpace: "nowrap", flex: 1,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(245,245,245,0.14)"; (e.target as HTMLElement).style.borderColor = "rgba(245,245,245,0.35)"; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "rgba(245,245,245,0.08)"; (e.target as HTMLElement).style.borderColor = "rgba(245,245,245,0.2)"; }}
                >Review Order →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {navArrows}
    </div>
  );
}
