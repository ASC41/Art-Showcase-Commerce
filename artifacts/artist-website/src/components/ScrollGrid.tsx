import { useRef, useMemo, startTransition, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import type { Artwork } from "@workspace/api-client-react";

type AnimationType =
  | "perspective-slide"
  | "rotation-fade"
  | "zoom-in"
  | "pop-out"
  | "row-slide"
  | "spin-up";

interface GridItemProps {
  artwork: Artwork;
  type: AnimationType;
  index: number;
  columns: number;
  onClick: () => void;
}

function GridItem({ artwork, type, index, columns, onClick }: GridItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });

  const opacity = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const x = useTransform(
    scrollYProgress,
    [0, 1],
    type === "perspective-slide"
      ? [index % 2 === 0 ? 150 : -150, 0]
      : type === "row-slide"
      ? [Math.floor(index / columns) % 2 === 0 ? -250 : 250, 0]
      : [0, 0]
  );
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    type === "rotation-fade" ? [200, 0] : type === "spin-up" ? [150, 0] : [0, 0]
  );
  const rotateY = useTransform(
    scrollYProgress,
    [0, 1],
    type === "perspective-slide" ? [index % 2 === 0 ? 45 : -45, 0] : type === "spin-up" ? [360, 0] : [0, 0]
  );
  const rotateX = useTransform(
    scrollYProgress,
    [0, 1],
    type === "rotation-fade" ? [-90, 0] : type === "pop-out" ? [45, 0] : [0, 0]
  );
  const scale = useTransform(
    scrollYProgress,
    [0, 1],
    type === "zoom-in" ? [0.2, 1] : [1, 1]
  );
  const z = useTransform(
    scrollYProgress,
    [0, 1],
    type === "zoom-in" ? [-1000, 0] : type === "pop-out" ? [800, 0] : [0, 0]
  );
  const filter = useTransform(
    scrollYProgress,
    [0, 1],
    type === "rotation-fade"
      ? ["brightness(300%) grayscale(100%)", "brightness(100%) grayscale(0%)"]
      : ["none", "none"]
  );

  return (
    <motion.div
      ref={ref}
      onClick={onClick}
      style={{
        x,
        y,
        z,
        rotateX,
        rotateY,
        scale,
        opacity,
        filter,
        position: "relative",
        aspectRatio: "3/4",
        borderRadius: "8px",
        overflow: "hidden",
        backgroundColor: "#111",
        transformStyle: "preserve-3d",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        cursor: "pointer",
      }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <img
        src={artwork.imageUrl}
        alt={artwork.title}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        loading="lazy"
      />
      {/* Hover overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(8,8,8,0.95) 0%, rgba(8,8,8,0.1) 60%, transparent 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "20px",
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "18px",
            fontWeight: 400,
            color: "#f5f5f5",
            marginBottom: "4px",
          }}
        >
          {artwork.title}
        </div>
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >
          {artwork.year && (
            <span style={{ fontFamily: "'Inter'", fontSize: "12px", color: "#888" }}>
              {artwork.year}
            </span>
          )}
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: "3px",
              fontSize: "10px",
              fontFamily: "'Inter'",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background:
                artwork.status === "available" ? "rgba(74,222,128,0.15)" : "rgba(82,82,82,0.3)",
              color: artwork.status === "available" ? "#4ade80" : "#888",
              border: `1px solid ${
                artwork.status === "available" ? "rgba(74,222,128,0.3)" : "rgba(82,82,82,0.4)"
              }`,
            }}
          >
            {artwork.status === "sold" ? "Sold" : artwork.status === "available" ? "Available" : "—"}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

const ANIMATION_TYPES: AnimationType[] = [
  "perspective-slide",
  "rotation-fade",
  "zoom-in",
  "pop-out",
  "row-slide",
  "spin-up",
];
const ANIMATION_LABELS = ["Perspective", "Rotation", "Zoom In", "Pop Out", "Row Slide", "Spin Up"];

interface ScrollGridProps {
  artworks: Artwork[];
  columns?: number;
  gap?: number;
  onItemClick?: (artwork: Artwork, index: number) => void;
  showAnimationBar?: boolean;
}

export default function ScrollGrid({
  artworks,
  columns = 3,
  gap = 20,
  onItemClick,
  showAnimationBar = true,
}: ScrollGridProps) {
  const [currentType, setCurrentType] = useState<AnimationType>("perspective-slide");

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .scroll-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .scroll-grid { grid-template-columns: repeat(1, 1fr) !important; }
        }
      `}</style>

      <div style={{ width: "100%", padding: "0 24px 24px", boxSizing: "border-box" }}>
        {showAnimationBar && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              width: "100%",
              padding: "8px",
              backgroundColor: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              gap: "6px",
              position: "sticky",
              top: "80px",
              marginBottom: "32px",
              backdropFilter: "blur(20px)",
              zIndex: 50,
            }}
          >
            {ANIMATION_LABELS.map((label, i) => {
              const isActive = currentType === ANIMATION_TYPES[i];
              return (
                <button
                  key={label}
                  onClick={() => startTransition(() => setCurrentType(ANIMATION_TYPES[i]))}
                  style={{
                    padding: "8px 18px",
                    background: isActive
                      ? "linear-gradient(135deg,#fff 0%,#f0f0f0 100%)"
                      : "transparent",
                    border: "none",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    fontFamily: "'Inter'",
                    color: isActive ? "#000" : "rgba(255,255,255,0.6)",
                    cursor: "pointer",
                    transition: "all 0.25s ease",
                    letterSpacing: "0.04em",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        <div
          className="scroll-grid"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: `${gap}px`,
            perspective: "1200px",
          }}
        >
          {artworks.map((artwork, index) => (
            <GridItem
              key={artwork.id}
              artwork={artwork}
              type={currentType}
              index={index}
              columns={columns}
              onClick={() => onItemClick?.(artwork, index)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
