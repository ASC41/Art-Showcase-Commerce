import { ComponentType, CSSProperties } from "react";

export interface GalleryXItem {
  title?: string;
  image?: { src: string; alt?: string };
  year?: number;
  hoverColor?: string;
  [key: string]: unknown;
}

export interface GalleryXProps {
  items?: GalleryXItem[];
  cellSize?: number;
  gap?: number;
  backgroundColor?: string;
  textColor?: string;
  arcAmount?: number;
  arcMaxAngleDeg?: number;
  arcAxis?: "horizontal" | "vertical";
  edgeFade?: number;
  parallaxEnabled?: boolean;
  parallaxStrength?: number;
  parallaxEase?: number;
  parallaxWhileDragging?: boolean;
  inertiaEnabled?: boolean;
  throwFriction?: number;
  throwVelocityScale?: number;
  throwMinSpeed?: number;
  throwMaxSpeed?: number;
  zoomValue?: number;
  cellPadding?: number;
  onItemClick?: (item: Record<string, unknown>) => void;
  style?: CSSProperties;
  className?: string;
}

declare const GalleryX: ComponentType<GalleryXProps>;
export default GalleryX;
