import { useState, useEffect, useCallback } from "react";
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

// Approximate print area position on Printify mockup images (as % of image container)
const PRINT_OVERLAY: Record<string, { top: string; left: string; width: string; height: string }> = {
  tshirt:          { top: "25%", left: "22%", width: "56%", height: "44%" },
  hoodie:          { top: "22%", left: "25%", width: "50%", height: "32%" },
  crewneck:        { top: "23%", left: "24%", width: "52%", height: "44%" },
  "dad-cap":       { top: "38%", left: "27%", width: "46%", height: "24%" },
  "phone-case":    { top: "5%",  left: "18%", width: "64%", height: "88%" },
  "tote-bag":      { top: "12%", left: "22%", width: "56%", height: "72%" },
  "cuff-beanie":   { top: "44%", left: "22%", width: "56%", height: "22%" },
  "bucket-hat":    { top: "36%", left: "26%", width: "48%", height: "28%" },
  "sweat-shorts":  { top: "50%", left: "10%", width: "34%", height: "38%" },
  "matte-poster":  { top: "2%",  left: "4%",  width: "92%", height: "94%" },
};

export default function MerchLightbox({ product, onClose }: MerchLightboxProps) {
  const { data: artworks } = useListArtworks();
  const { toast } = useToast();

  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [mockupIndex, setMockupIndex] = useState(0);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Reset state when product changes
  useEffect(() => {
    if (product) {
      setSelectedArtwork(null);
      setSelectedVariantId(null);
      setSelectedColor(null);
      setMockupIndex(0);
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

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
  const mockupImages = product.mockupImages ?? [];
  const currentMockup = mockupImages[mockupIndex] ?? null;

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

          {/* LEFT: Product mockup */}
          <div style={{ flex: "0 0 440px", maxWidth: "440px" }}>
            {currentMockup ? (
              <div style={{ position: "relative" }}>
                {/* Mockup image wrapper — relative so artwork overlay can be positioned inside */}
                <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", background: "#111" }}>
                  <motion.img
                    key={mockupIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    src={currentMockup}
                    alt={`${product.name} mockup`}
                    style={{
                      width: "100%",
                      display: "block",
                      objectFit: "contain",
                    }}
                  />

                  {/* Artwork overlay — updates live when artwork selection changes */}
                  {selectedArtwork && PRINT_OVERLAY[product.slug] && (() => {
                    const ov = PRINT_OVERLAY[product.slug];
                    return (
                      <motion.div
                        key={selectedArtwork.slug}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.25 }}
                        style={{
                          position: "absolute",
                          top: ov.top,
                          left: ov.left,
                          width: ov.width,
                          height: ov.height,
                          overflow: "hidden",
                          pointerEvents: "none",
                        }}
                      >
                        <img
                          src={selectedArtwork.imageUrl}
                          alt={selectedArtwork.title}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            display: "block",
                            opacity: 0.93,
                          }}
                        />
                      </motion.div>
                    );
                  })()}
                </div>

                {mockupImages.length > 1 && (
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      marginTop: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    {mockupImages.slice(0, 6).map((src, i) => (
                      <button
                        key={i}
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
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  background: "#111",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#444",
                  fontFamily: "'Inter'",
                  fontSize: "13px",
                  letterSpacing: "0.08em",
                }}
              >
                MOCKUP GENERATING
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
      </motion.div>
    </AnimatePresence>
  );
}
