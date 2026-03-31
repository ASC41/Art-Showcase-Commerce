import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SOFT_BRUSH =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <defs>
        <radialGradient id="g" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stop-color="white" stop-opacity="1"/>
          <stop offset="55%"  stop-color="white" stop-opacity="0.85"/>
          <stop offset="80%"  stop-color="white" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="100" rx="100" ry="80" fill="url(#g)"/>
    </svg>`
  );

export default function PaintReveal({
  baseImage,
  revealImage,
  brushTexture = SOFT_BRUSH,
  brushSize = 180,
  fadeDuration = 3.5,
  maxStamps = 60,
  borderRadius = 0,
}) {
  const [stamps, setStamps] = useState([]);
  const [isPaintMode, setIsPaintMode] = useState(false);
  const containerRef = useRef(null);
  const idCounter = useRef(0);
  const lastTapRef = useRef(0);
  const maskId = useMemo(
    () => "paint-mask-" + Math.random().toString(36).substr(2, 9),
    []
  );

  const getResponsiveBrushSize = () => {
    if (!containerRef.current) return brushSize;
    const w = containerRef.current.offsetWidth;
    if (w < 768) return brushSize * 0.65;
    if (w < 1024) return brushSize * 0.85;
    return brushSize;
  };

  const handleDoubleTap = (e) => {
    const now = Date.now();
    const timeSince = now - lastTapRef.current;
    if (timeSince < 300 && timeSince > 0) {
      setIsPaintMode((prev) => !prev);
      e.preventDefault();
    }
    lastTapRef.current = now;
  };

  const addStamp = (e) => {
    if (!containerRef.current) return;
    if (e.type.includes("touch") && !isPaintMode) return;
    if (e.type.includes("touch") && isPaintMode) e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const bs = getResponsiveBrushSize();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = clientX - rect.left - bs / 2;
    const y = clientY - rect.top - bs / 2;
    const newStamp = { id: idCounter.current++, x, y, size: bs };
    setStamps((prev) => {
      const next = [...prev, newStamp];
      return next.length > maxStamps ? next.slice(next.length - maxStamps) : next;
    });
  };

  const removeStamp = (id) => {
    setStamps((prev) => prev.filter((s) => s.id !== id));
  };

  return _jsx("div", {
    ref: containerRef,
    onPointerMove: (e) => e.buttons > 0 && addStamp(e),
    onPointerDown: (e) => !e.pointerType.includes("touch") && addStamp(e),
    onTouchStart: (e) => {
      handleDoubleTap(e);
      if (isPaintMode) addStamp(e);
    },
    onTouchMove: (e) => isPaintMode && addStamp(e),
    style: {
      width: "100%",
      height: "100%",
      position: "relative",
      overflow: "hidden",
      touchAction: isPaintMode ? "none" : "auto",
      WebkitUserSelect: "none",
      userSelect: "none",
      cursor: "crosshair",
      borderRadius,
    },
    children: _jsxs(_Fragment, {
      children: [
        isPaintMode &&
          _jsx(motion.div, {
            initial: { opacity: 0, y: -10 },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: -10 },
            style: {
              position: "absolute",
              top: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.7)",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: "500",
              zIndex: 10,
              pointerEvents: "none",
              backdropFilter: "blur(8px)",
            },
            children: "Paint Mode • Double-tap to exit",
          }),
        _jsx("div", {
          style: {
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${baseImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          },
        }),
        _jsx("div", {
          style: {
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${revealImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            WebkitMask: `url(#${maskId})`,
            mask: `url(#${maskId})`,
          },
        }),
        _jsx("svg", {
          style: { position: "absolute", width: 0, height: 0 },
          children: _jsx("defs", {
            children: _jsxs("mask", {
              id: maskId,
              children: [
                _jsx("rect", { width: "100%", height: "100%", fill: "black" }),
                _jsx(AnimatePresence, {
                  children: stamps.map((s) =>
                    _jsx(
                      motion.image,
                      {
                        href: brushTexture,
                        x: s.x,
                        y: s.y,
                        width: s.size,
                        height: s.size,
                        initial: { opacity: 0 },
                        animate: { opacity: 1 },
                        exit: { opacity: 0 },
                        transition: { duration: fadeDuration, ease: "linear" },
                        onAnimationComplete: () => removeStamp(s.id),
                      },
                      s.id
                    )
                  ),
                }),
              ],
            }),
          }),
        }),
      ],
    }),
  });
}
