import { useState, useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import Navbar from "@/components/Navbar";
import MerchLightbox from "@/components/MerchLightbox";
import { useIsMobile } from "@/hooks/use-mobile";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

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

interface GalleryArtwork {
  slug: string;
  title: string;
  imageUrl: string;
}

function pickThumbnail(slug: string, images: string[], globalIndex: number): string | undefined {
  const THUMBNAIL_INDEX: Record<string, number> = {
    "bucket-hat": 0,
    "hoodie": 0,
  };
  if (slug in THUMBNAIL_INDEX) return images[THUMBNAIL_INDEX[slug]];
  if (globalIndex === 0 || images.length <= 1) return images[0];
  const getLabel = (url: string) => url.match(/camera_label=([^&]+)/)?.[1] ?? "";
  const preferred = ["person", "context", "collar", "detail"];
  const avoided = ["back", "folded", "size-chart"];
  for (const pref of preferred) {
    const hit = images.find((u) => getLabel(u).includes(pref));
    if (hit) return hit;
  }
  const fallback = images.slice(1).find((u) => !avoided.some((a) => getLabel(u).includes(a)));
  if (fallback) return fallback;
  return images[0];
}

function MerchCard({
  product,
  globalIndex,
  featuredArtwork,
  onSelect,
}: {
  product: MerchProduct;
  globalIndex: number;
  featuredArtwork: GalleryArtwork | null;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.6], [0, 1]);
  const y = useTransform(scrollYProgress, [0, 0.6], [60, 0]);

  // Per-artwork mockup: fetched lazily, falls back to template while loading.
  const [artworkMockupUrl, setArtworkMockupUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!featuredArtwork) return;
    setArtworkMockupUrl(null);
    let cancelled = false;
    fetch(`${BASE_URL}/api/merch/${product.slug}/artwork/${featuredArtwork.slug}/mockups`)
      .then((r) => r.json())
      .then((data: { mockupImages?: string[] }) => {
        if (cancelled) return;
        const imgs = data.mockupImages ?? [];
        const picked = pickThumbnail(product.slug, imgs, globalIndex);
        if (picked) setArtworkMockupUrl(picked);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [product.slug, featuredArtwork?.slug, globalIndex]);

  // Template mockup (shown immediately while per-artwork one loads)
  const images = product.mockupImages ?? [];
  const mockup = artworkMockupUrl ?? pickThumbnail(product.slug, images, globalIndex);
  const colors = [...new Set((product.variants ?? []).map((v) => v.color))];
  const minPrice = product.priceCents;

  return (
    <motion.div
      ref={ref}
      style={{ opacity, y }}
      onClick={onSelect}
      whileHover={{ scale: 1.015 }}
      transition={{ duration: 0.2 }}
    >
      <div
        style={{
          background: "#0d0d0d",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "12px",
          overflow: "hidden",
          cursor: "pointer",
          transition: "border-color 0.2s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.15)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)";
        }}
      >
        {/* Card image: product mockup with rotating artwork */}
        <div
          style={{
            width: "100%",
            aspectRatio: "1",
            background: "#0a0a0a",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {mockup ? (
            <img
              src={mockup}
              alt={product.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
                transition: "transform 0.4s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLImageElement).style.transform = "scale(1.04)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLImageElement).style.transform = "scale(1)";
              }}
              loading="lazy"
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#333",
                fontFamily: "'Inter'",
                fontSize: "11px",
                letterSpacing: "0.1em",
              }}
            >
              LOADING
            </div>
          )}

          {/* Category badge */}
          <div
            style={{
              position: "absolute",
              top: "12px",
              left: "12px",
              padding: "4px 10px",
              background: "rgba(8,8,8,0.75)",
              backdropFilter: "blur(8px)",
              borderRadius: "20px",
              fontFamily: "'Inter'",
              fontSize: "10px",
              letterSpacing: "0.12em",
              color: "#888",
              textTransform: "uppercase",
            }}
          >
            {product.category}
          </div>
        </div>

        {/* Card info */}
        <div style={{ padding: "20px" }}>
          <h3
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "20px",
              fontWeight: 400,
              color: "#f5f5f5",
              margin: "0 0 6px",
              letterSpacing: "0.03em",
            }}
          >
            {product.name}
          </h3>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <span
              style={{
                fontFamily: "'Inter'",
                fontSize: "14px",
                color: "#f5f5f5",
                fontWeight: 500,
              }}
            >
              ${(minPrice / 100).toFixed(0)}
            </span>
            {colors.length > 1 && (
              <span
                style={{
                  fontFamily: "'Inter'",
                  fontSize: "11px",
                  color: "#555",
                  letterSpacing: "0.06em",
                }}
              >
                {colors.length} colors
              </span>
            )}
          </div>

          {/* Color swatches */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span
              style={{
                fontFamily: "'Inter'",
                fontSize: "10px",
                color: "#444",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginRight: "4px",
              }}
            >
              {colors.length > 0 ? "Colors" : ""}
            </span>
            {colors.slice(0, 8).map((color) => (
              <div
                key={color}
                title={color}
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: color.toLowerCase(),
                  border: "1px solid rgba(255,255,255,0.15)",
                  flexShrink: 0,
                }}
              />
            ))}
            {colors.length > 8 && (
              <span
                style={{
                  fontFamily: "'Inter'",
                  fontSize: "10px",
                  color: "#444",
                  letterSpacing: "0.04em",
                }}
              >
                +{colors.length - 8}
              </span>
            )}
          </div>

          <div
            style={{
              marginTop: "14px",
              fontFamily: "'Inter'",
              fontSize: "10px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#555",
            }}
          >
            Your artwork →
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: "#0d0d0d",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          background: "linear-gradient(90deg, #111 25%, #161616 50%, #111 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
        }}
      />
      <div style={{ padding: "20px" }}>
        <div
          style={{
            height: "20px",
            width: "60%",
            background: "#161616",
            borderRadius: "4px",
            marginBottom: "8px",
          }}
        />
        <div
          style={{
            height: "14px",
            width: "30%",
            background: "#161616",
            borderRadius: "4px",
          }}
        />
      </div>
    </div>
  );
}

export default function Merch() {
  const [products, setProducts] = useState<MerchProduct[]>([]);
  const [artworks, setArtworks] = useState<GalleryArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MerchProduct | null>(null);
  const isMobile = useIsMobile();
  const px = isMobile ? "20px" : "40px";

  useEffect(() => {
    Promise.all([
      fetch(`${BASE_URL}/api/merch`).then((r) => r.json()),
      fetch(`${BASE_URL}/api/artworks`).then((r) => r.json()),
    ])
      .then(([merch, arts]) => {
        setProducts(Array.isArray(merch) ? merch : []);
        setArtworks(Array.isArray(arts) ? arts : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const apparel = products.filter((p) => p.category === "apparel");
  const accessories = products.filter((p) => p.category === "accessories");
  const prints = products.filter((p) => p.category === "print");

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#f5f5f5" }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <Navbar />

      {/* Header */}
      <div
        style={{
          paddingTop: isMobile ? "80px" : "120px",
          paddingBottom: "32px",
          paddingLeft: px,
          paddingRight: px,
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
          Merch
        </h1>
        <p
          style={{
            fontFamily: "'Inter'",
            fontSize: "13px",
            color: "#666",
            letterSpacing: "0.08em",
            margin: 0,
          }}
        >
          {loading
            ? "Loading collection..."
            : `${products.length} items — wearable originals, printed on demand`}
        </p>
      </div>

      {/* Prints section */}
      {(loading || prints.length > 0) && (
        <section style={{ padding: `0 ${px} 64px` }}>
          <div
            style={{
              fontFamily: "'Inter'",
              fontSize: "11px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#444",
              marginBottom: "24px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              paddingBottom: "12px",
            }}
          >
            Prints
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "24px",
            }}
          >
            {loading
              ? Array.from({ length: 1 }).map((_, i) => <SkeletonCard key={i} />)
              : prints.map((product, i) => (
                  <MerchCard
                    key={product.slug}
                    product={product}
                    globalIndex={i}
                    featuredArtwork={artworks.length > 0 ? artworks[i % artworks.length] : null}
                    onSelect={() => setSelected(product)}
                  />
                ))}
          </div>
        </section>
      )}

      {/* Apparel section */}
      {(loading || apparel.length > 0) && (
        <section style={{ padding: `0 ${px} 64px` }}>
          <div
            style={{
              fontFamily: "'Inter'",
              fontSize: "11px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#444",
              marginBottom: "24px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              paddingBottom: "12px",
            }}
          >
            Apparel
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "24px",
            }}
          >
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
              : apparel.map((product, i) => (
                  <MerchCard
                    key={product.slug}
                    product={product}
                    globalIndex={prints.length + i}
                    featuredArtwork={artworks.length > 0 ? artworks[(prints.length + i) % artworks.length] : null}
                    onSelect={() => setSelected(product)}
                  />
                ))}
          </div>
        </section>
      )}

      {/* Accessories section */}
      {(loading || accessories.length > 0) && (
        <section style={{ padding: `0 ${px} 80px` }}>
          <div
            style={{
              fontFamily: "'Inter'",
              fontSize: "11px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#444",
              marginBottom: "24px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              paddingBottom: "12px",
            }}
          >
            Accessories
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "24px",
            }}
          >
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              : accessories.map((product, i) => (
                  <MerchCard
                    key={product.slug}
                    product={product}
                    globalIndex={prints.length + apparel.length + i}
                    featuredArtwork={artworks.length > 0 ? artworks[(prints.length + apparel.length + i) % artworks.length] : null}
                    onSelect={() => setSelected(product)}
                  />
                ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!loading && products.length === 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 40px",
            color: "#444",
          }}
        >
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "24px",
              fontWeight: 300,
              letterSpacing: "0.06em",
              marginBottom: "12px",
            }}
          >
            Collection coming soon
          </div>
          <p
            style={{
              fontFamily: "'Inter'",
              fontSize: "13px",
              color: "#333",
              textAlign: "center",
              maxWidth: "360px",
              lineHeight: 1.7,
            }}
          >
            We're finalizing the merch line. Check back shortly.
          </p>
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <MerchLightbox product={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
