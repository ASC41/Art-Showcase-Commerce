import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListArtworks } from "@workspace/api-client-react";
import type { Artwork } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface MerchVariant {
  id: number;
  title: string;
  color: string;
  size: string;
}

interface MerchProduct {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  mockupImages: string[];
  variants: MerchVariant[];
  category: string;
  printAreaWidth: number | null;
  printAreaHeight: number | null;
}

interface MerchLightboxProps {
  product: MerchProduct | null;
  onClose: () => void;
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function MerchLightbox({ product, onClose }: MerchLightboxProps) {
  const { data: artworks } = useListArtworks();
  const { toast } = useToast();

  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [mockupIndex, setMockupIndex] = useState(0);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Artwork-specific mockup state
  const [artworkMockups, setArtworkMockups] = useState<string[] | null>(null);
  const [loadingMockups, setLoadingMockups] = useState(false);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Reset state when product changes
  useEffect(() => {
    if (product) {
      setSelectedArtwork(null);
      setSelectedVariantId(null);
      setSelectedColor(null);
      setMockupIndex(0);
      setArtworkMockups(null);
      setLoadingMockups(false);
    }
  }, [product?.slug]);

  // Auto-select first available artwork
  useEffect(() => {
    if (artworks && artworks.length > 0 && !selectedArtwork) {
      setSelectedArtwork(artworks[0]);
    }
  }, [artworks, selectedArtwork]);

  // Auto-select first variant when color changes or on mount
  useEffect(() => {
    if (!product) return;
    const variants = product.variants ?? [];
    if (variants.length === 0) return;

    const uniqueColors = [...new Set(variants.map((v) => v.color))];
    if (!selectedColor && uniqueColors.length > 0) {
      setSelectedColor(uniqueColors[0]);
    }
    if (selectedColor) {
      const colorVariants = variants.filter((v) => v.color === selectedColor);
      if (colorVariants.length > 0 && !colorVariants.find((v) => v.id === selectedVariantId)) {
        setSelectedVariantId(colorVariants[0].id);
      }
    }
  }, [product, selectedColor, selectedVariantId]);

  // Fetch artwork-specific mockup images when artwork changes
  useEffect(() => {
    if (!product || !selectedArtwork) return;

    // Cancel any in-flight request
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoadingMockups(true);
    setMockupIndex(0);

    fetch(
      `${BASE_URL}/api/merch/${encodeURIComponent(product.slug)}/artwork/${encodeURIComponent(selectedArtwork.slug)}/mockups`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((data: { mockupImages: string[] }) => {
        const urls = data.mockupImages ?? [];
        if (urls.length > 0) {
          // Preload the first image so the spinner stays on until it's ready.
          // This eliminates the blank gap between the spinner disappearing and
          // the image rendering — the image is in the browser cache by the time
          // we update state, so it appears instantly.
          const img = new window.Image();
          img.onload = () => {
            if (!controller.signal.aborted) {
              setArtworkMockups(urls);
              setLoadingMockups(false);
            }
          };
          img.onerror = () => {
            if (!controller.signal.aborted) {
              setArtworkMockups(urls);
              setLoadingMockups(false);
            }
          };
          img.src = urls[0];
        } else {
          setArtworkMockups(null);
          setLoadingMockups(false);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setArtworkMockups(null);
          setLoadingMockups(false);
        }
      });

    return () => controller.abort();
  }, [product?.slug, selectedArtwork?.slug]);

  // Close zoom when product/artwork changes
  useEffect(() => { setIsZoomed(false); }, [product?.slug, selectedArtwork?.slug]);

  // Unified keyboard handler — zoom intercepts Escape and arrows; lightbox handles Escape when not zoomed
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isZoomed) {
        if (e.key === "Escape") { setIsZoomed(false); return; }
        if (e.key === "ArrowLeft") setMockupIndex((i) => Math.max(0, i - 1));
        if (e.key === "ArrowRight")
          setMockupIndex((i) => Math.min(displayMockups.length - 1, i + 1));
      } else {
        if (e.key === "Escape") onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isZoomed, displayMockups.length, onClose]);

  const handleCheckout = async () => {
    if (!product || !selectedVariantId || !selectedArtwork) return;

    setIsCheckingOut(true);
    try {
      const res = await fetch(`${BASE_URL}/api/checkout/merch-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchSlug: product.slug,
          variantId: selectedVariantId,
          artworkSlug: selectedArtwork.slug,
          successUrl: `${window.location.origin}${BASE_URL}/order/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: window.location.href,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Checkout failed");
      }

      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      toast({
        title: "Checkout error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (!product) return null;

  const variants = product.variants ?? [];
  const uniqueColors = [...new Set(variants.map((v) => v.color))];
  const sizesForColor = selectedColor
    ? variants.filter((v) => v.color === selectedColor).map((v) => v.size)
    : [];

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);

  // ── Per-variant vs colorized mockup strategy ─────────────────────────────
  //
  // Some products (phone cases, cuff beanies, bucket hats) store ONE mockup image
  // per variant in the Printify response. Each URL's camera ID is only valid for
  // its specific variant — swapping the variant segment produces broken CDN links
  // and makes every thumbnail show the same image (the selected variant's image).
  //
  // For these products we skip colorization entirely and instead filter the image
  // list to only the URLs whose embedded variantId matches the selected variant.
  // For all other products (tees, hoodies, crewnecks, posters, totes) Printify
  // shares camera IDs across variants so URL-swapping works correctly.
  const PER_VARIANT_SLUGS = ["phone-case", "cuff-beanie", "bucket-hat"];
  const isPerVariant = PER_VARIANT_SLUGS.includes(product.slug);

  const representativeVariantId = (color: string | null): number | null => {
    if (!color) return null;
    const colorVars = variants.filter((v) => v.color === color);
    return (
      colorVars.find((v) => v.size === "L")?.id ??
      colorVars.find((v) => v.size === "M")?.id ??
      colorVars[0]?.id ?? null
    );
  };

  const recolorMockupUrl = (url: string, targetVariantId: number): string =>
    url.replace(/\/mockup\/([^/]+)\/\d+\//, `/mockup/$1/${targetVariantId}/`);

  const colorizedMockups = (urls: string[]): string[] => {
    // Per-variant products: URLs already have the correct variant ID baked in.
    // Return unchanged — filtering handles color display below.
    if (isPerVariant) return urls;
    const targetId = selectedVariantId ?? representativeVariantId(selectedColor);
    if (!targetId) return urls;
    return urls.map((url) =>
      url.includes("/mockup/") ? recolorMockupUrl(url, targetId) : url
    );
  };

  // Phone cases: when the user picks a phone model, jump to the matching image.
  // artworkMockups stores one front image per variant (iPhone 12 → 16 Pro Max),
  // so we find the index whose URL contains the selected variant ID.
  useEffect(() => {
    if (product?.slug !== "phone-case" || !artworkMockups || !selectedVariantId) return;
    const idx = artworkMockups.findIndex((url) => {
      const m = url.match(/\/mockup\/[^/]+\/(\d+)\//);
      return m ? parseInt(m[1], 10) === selectedVariantId : false;
    });
    if (idx >= 0) setMockupIndex(idx);
  }, [product?.slug, selectedVariantId, artworkMockups]);

  // Use artwork-specific mockups if loaded, else fall back to template mockups;
  // then apply color substitution so every image shows the selected color.
  const rawMockups = colorizedMockups(artworkMockups ?? product.mockupImages ?? []);

  // For per-variant products: only show images for the currently selected variant
  // so the carousel doesn't mix different colors in the thumbnail strip.
  const displayMockups = (() => {
    if (!isPerVariant) return rawMockups;
    const targetId = selectedVariantId ?? representativeVariantId(selectedColor);
    if (!targetId) return rawMockups;
    const filtered = rawMockups.filter((url) => {
      const m = url.match(/\/mockup\/[^/]+\/(\d+)\//);
      return m ? parseInt(m[1], 10) === targetId : true;
    });
    return filtered.length > 0 ? filtered : rawMockups;
  })();
  const currentMockup = displayMockups[mockupIndex] ?? displayMockups[0] ?? null;

  const isOneSize =
    variants.length > 0 && variants.every((v) => v.size === "One size");

  const canBuy = !!selectedVariantId && !!selectedArtwork;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(4,4,4,0.96)",
          backdropFilter: "blur(12px)",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflowY: "auto",
          padding: "24px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: "960px",
            display: "flex",
            flexDirection: "row",
            gap: "48px",
            alignItems: "flex-start",
            position: "relative",
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: "fixed",
              top: "24px",
              right: "24px",
              background: "none",
              border: "none",
              color: "#888",
              fontSize: "24px",
              cursor: "pointer",
              zIndex: 10,
              lineHeight: 1,
              padding: "8px",
            }}
          >
            ✕
          </button>

          {/* LEFT: Product mockup (artwork-specific from Printify) */}
          <div style={{ flex: "0 0 440px", maxWidth: "440px" }}>
            {/* Main mockup image */}
            <div
              style={{
                position: "relative",
                borderRadius: "12px",
                overflow: "hidden",
                background: "#111",
                aspectRatio: "1",
              }}
            >
              {/* Loading overlay */}
              <AnimatePresence>
                {loadingMockups && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      zIndex: 2,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(8,8,8,0.72)",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        border: "2px solid rgba(255,255,255,0.1)",
                        borderTopColor: "#f5f5f5",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                        marginBottom: "12px",
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "'Inter'",
                        fontSize: "11px",
                        letterSpacing: "0.1em",
                        color: "#666",
                        textTransform: "uppercase",
                      }}
                    >
                      Generating preview…
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {currentMockup ? (
                <motion.img
                  key={`${selectedArtwork?.slug ?? "default"}-${selectedColor ?? ""}-${mockupIndex}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.35 }}
                  src={currentMockup}
                  alt={`${product.name} mockup`}
                  onClick={() => setIsZoomed(true)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                    cursor: "zoom-in",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#444",
                    fontFamily: "'Inter'",
                    fontSize: "13px",
                    letterSpacing: "0.08em",
                  }}
                >
                  GENERATING MOCKUP
                </div>
              )}
            </div>

            {/* Thumbnail strip — only shown once artwork-specific mockups are ready.
                Deliberately avoids showing template/fallback images here. */}
            {!loadingMockups && artworkMockups && artworkMockups.length > 1 && (
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginTop: "12px",
                  flexWrap: "wrap",
                }}
              >
                {displayMockups.slice(0, 6).map((src, i) => (
                  <button
                    key={`${selectedArtwork?.slug ?? "default"}-${selectedColor ?? ""}-${i}`}
                    onClick={() => setMockupIndex(i)}
                    style={{
                      width: "56px",
                      height: "56px",
                      padding: 0,
                      border: i === mockupIndex
                        ? "2px solid #f5f5f5"
                        : "2px solid transparent",
                      borderRadius: "6px",
                      overflow: "hidden",
                      cursor: "pointer",
                      background: "#111",
                      opacity: i === mockupIndex ? 1 : 0.5,
                      transition: "opacity 0.2s, border-color 0.2s",
                    }}
                  >
                    <img
                      src={src}
                      alt={`Mockup ${i + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Info + selectors */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Category + Name */}
            <div
              style={{
                fontFamily: "'Inter'",
                fontSize: "11px",
                letterSpacing: "0.16em",
                color: "#666",
                textTransform: "uppercase",
                marginBottom: "8px",
              }}
            >
              {product.category}
            </div>
            <h2
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "clamp(24px, 3vw, 36px)",
                fontWeight: 300,
                color: "#f5f5f5",
                margin: "0 0 8px",
                letterSpacing: "0.04em",
              }}
            >
              {product.name}
            </h2>
            <div
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "22px",
                fontWeight: 400,
                color: "#f5f5f5",
                marginBottom: "16px",
              }}
            >
              ${(product.priceCents / 100).toFixed(0)}
            </div>
            {product.description && (
              <p
                style={{
                  fontFamily: "'Inter'",
                  fontSize: "13px",
                  lineHeight: 1.7,
                  color: "#888",
                  margin: "0 0 32px",
                }}
              >
                {product.description}
              </p>
            )}

            {/* ARTWORK SELECTOR */}
            <div style={{ marginBottom: "28px" }}>
              <div
                style={{
                  fontFamily: "'Inter'",
                  fontSize: "11px",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#666",
                  marginBottom: "12px",
                }}
              >
                Artwork — {selectedArtwork?.title ?? "Select"}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  maxHeight: "180px",
                  overflowY: "auto",
                }}
              >
                {artworks?.map((artwork) => (
                  <button
                    key={artwork.slug}
                    onClick={() => setSelectedArtwork(artwork)}
                    title={artwork.title}
                    style={{
                      width: "60px",
                      height: "60px",
                      padding: 0,
                      border: selectedArtwork?.slug === artwork.slug
                        ? "2px solid #f5f5f5"
                        : "2px solid rgba(255,255,255,0.1)",
                      borderRadius: "6px",
                      overflow: "hidden",
                      cursor: "pointer",
                      background: "#111",
                      transition: "border-color 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={artwork.imageUrl}
                      alt={artwork.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* COLOR SELECTOR */}
            {uniqueColors.length > 1 && (
              <div style={{ marginBottom: "20px" }}>
                <div
                  style={{
                    fontFamily: "'Inter'",
                    fontSize: "11px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#666",
                    marginBottom: "10px",
                  }}
                >
                  Color — {selectedColor}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {uniqueColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        setSelectedColor(color);
                        setSelectedVariantId(null);
                        setMockupIndex(0);
                      }}
                      style={{
                        padding: "6px 14px",
                        background: "transparent",
                        border: selectedColor === color
                          ? "1px solid #f5f5f5"
                          : "1px solid rgba(255,255,255,0.18)",
                        borderRadius: "20px",
                        color: selectedColor === color ? "#f5f5f5" : "#888",
                        fontFamily: "'Inter'",
                        fontSize: "12px",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SIZE SELECTOR */}
            {!isOneSize && sizesForColor.length > 0 && (
              <div style={{ marginBottom: "28px" }}>
                <div
                  style={{
                    fontFamily: "'Inter'",
                    fontSize: "11px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#666",
                    marginBottom: "10px",
                  }}
                >
                  Size — {selectedVariant?.size ?? "Select"}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {sizesForColor.map((size) => {
                    const variant = variants.find(
                      (v) => v.color === selectedColor && v.size === size
                    );
                    const isSelected = variant?.id === selectedVariantId;
                    return (
                      <button
                        key={size}
                        onClick={() => variant && setSelectedVariantId(variant.id)}
                        style={{
                          padding: "6px 14px",
                          background: isSelected ? "#f5f5f5" : "transparent",
                          border: isSelected
                            ? "1px solid #f5f5f5"
                            : "1px solid rgba(255,255,255,0.18)",
                          borderRadius: "4px",
                          color: isSelected ? "#080808" : "#888",
                          fontFamily: "'Inter'",
                          fontSize: "12px",
                          fontWeight: isSelected ? 600 : 400,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          letterSpacing: "0.04em",
                          minWidth: "40px",
                        }}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* One-size notice */}
            {isOneSize && (
              <div
                style={{
                  fontFamily: "'Inter'",
                  fontSize: "12px",
                  color: "#666",
                  marginBottom: "28px",
                  letterSpacing: "0.04em",
                }}
              >
                One size fits all
              </div>
            )}

            {/* BUY BUTTON */}
            <motion.button
              onClick={handleCheckout}
              disabled={!canBuy || isCheckingOut}
              whileHover={canBuy ? { scale: 1.02 } : {}}
              whileTap={canBuy ? { scale: 0.98 } : {}}
              style={{
                width: "100%",
                padding: "16px 24px",
                background: canBuy ? "#f5f5f5" : "#1a1a1a",
                border: "none",
                borderRadius: "6px",
                color: canBuy ? "#080808" : "#444",
                fontFamily: "'Inter'",
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: canBuy ? "pointer" : "not-allowed",
                transition: "background 0.2s",
              }}
            >
              {isCheckingOut
                ? "PROCESSING..."
                : canBuy
                ? `BUY NOW — $${(product.priceCents / 100).toFixed(0)}`
                : selectedArtwork
                ? "SELECT SIZE"
                : "SELECT ARTWORK"}
            </motion.button>

            <p
              style={{
                fontFamily: "'Inter'",
                fontSize: "11px",
                color: "#444",
                marginTop: "12px",
                textAlign: "center",
                letterSpacing: "0.06em",
              }}
            >
              Printed on demand · Ships in 5–10 business days
            </p>
          </div>
        </motion.div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </motion.div>

      {/* ── Fullscreen image zoom overlay ─────────────────────────────────── */}
      <AnimatePresence>
        {isZoomed && currentMockup && (
          <motion.div
            key="zoom-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setIsZoomed(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 400,
              background: "rgba(0,0,0,0.97)",
              backdropFilter: "blur(24px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setIsZoomed(false)}
              style={{
                position: "fixed",
                top: "24px",
                right: "24px",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "50%",
                width: "40px",
                height: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#aaa",
                fontSize: "18px",
                cursor: "pointer",
                zIndex: 1,
                lineHeight: 1,
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
            >
              ✕
            </button>

            {/* Image counter */}
            {displayMockups.length > 1 && (
              <div
                style={{
                  position: "fixed",
                  top: "28px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontFamily: "'Inter'",
                  fontSize: "11px",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.35)",
                  pointerEvents: "none",
                }}
              >
                {mockupIndex + 1} / {displayMockups.length}
              </div>
            )}

            {/* Prev arrow */}
            {mockupIndex > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setMockupIndex((i) => i - 1); }}
                style={{
                  position: "fixed",
                  left: "24px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "50%",
                  width: "48px",
                  height: "48px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#f5f5f5",
                  fontSize: "20px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                  zIndex: 1,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
              >
                ←
              </button>
            )}

            {/* Next arrow */}
            {mockupIndex < displayMockups.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setMockupIndex((i) => i + 1); }}
                style={{
                  position: "fixed",
                  right: "24px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "50%",
                  width: "48px",
                  height: "48px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#f5f5f5",
                  fontSize: "20px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                  zIndex: 1,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
              >
                →
              </button>
            )}

            {/* Full-resolution image — stops click propagation so only the backdrop dismisses */}
            <motion.img
              key={`zoom-${mockupIndex}`}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              src={displayMockups[mockupIndex]}
              alt={`${product.name} mockup fullscreen`}
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "90vw",
                maxHeight: "90vh",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                display: "block",
                borderRadius: "4px",
                cursor: "zoom-out",
                userSelect: "none",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}
