import { CSSProperties } from "react";

export interface DraggableGalleryItem {
  type: "image" | "video" | "empty";
  src: string;
  alt?: string;
  title?: string;
  cover?: string;
  slug?: string;
  aspectRatio?: number;
  wide?: boolean;
  [key: string]: unknown;
}

export interface DraggableGalleryFont {
  fontSize?: string;
  variant?: number;
  letterSpacing?: string;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right";
  fontFamily?: string;
  fontWeight?: number;
}

export interface DraggableGalleryProps {
  items?: DraggableGalleryItem[];
  columns?: number;
  baseWidth?: number;
  smallHeight?: number;
  largeHeight?: number;
  itemGap?: number;
  hoverScale?: number;
  expandedScale?: number;
  dragEase?: number;
  momentumFactor?: number;
  bufferZone?: number;
  borderRadius?: number;
  background?: string;
  vignetteStrength?: number;
  vignetteSize?: number;
  overlayOpacity?: number;
  overlayDuration?: number;
  animationDelay?: number;
  closeAnimationDelay?: number;
  font?: DraggableGalleryFont;
  captionColor?: string;
  introAnimation?: string;
  onItemClick?: (item: DraggableGalleryItem) => void;
  style?: CSSProperties;
}

declare const DraggableGallery: React.ComponentType<DraggableGalleryProps>;
export default DraggableGallery;
