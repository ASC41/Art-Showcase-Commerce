export interface PaintRevealProps {
  baseImage?: string;
  revealImage?: string;
  brushTexture?: string;
  brushSize?: number;
  fadeDuration?: number;
  maxStamps?: number;
  borderRadius?: number;
}

declare const PaintReveal: React.ComponentType<PaintRevealProps>;
export default PaintReveal;
