// Pixel dimensions (width × height) provided by the artist.
// aspectRatio = height / width (> 1 = portrait, < 1 = landscape)
// For rotated images, the aspect ratio reflects the DISPLAYED orientation (post-rotation).
export const ARTWORK_ASPECT: Record<string, number> = {
  "grin-and-bear-it":     1041 / 691,
  "give-me-peace":        1195 / 896,
  "hilarity":             734  / 1124,
  "hands-to-yourself":    1233 / 864,
  "maybe-tomorrow":       2390 / 1792,
  "our-lives":            1136 / 943,
  "the-toast":            1433 / 1126,
  "the-warm-waking-cold": 2156 / 1792,
  "endure":               2374 / 1776,
  "hope-far-away-hope":   2101 / 1503,
  "she-runs-these-hills": 925  / 1490,
  "untitled-02":          2390 / 1792,
  "a-cry-for-help":       1728 / 2462, // portrait source, displayed landscape (-90°)
  "untitled-04":          1607 / 2456,
  "untitled-05":          2371 / 1792,
  "be-no-evil":           1081 / 811,
  "the-lights-too-bright-the-sound-too-loud": 856  / 848,
  "untitled-08":          1296 / 972,
  "untitled-09":          1296 / 972,
  "untitled-10":          1296 / 972,
};

// Degrees to rotate an image for correct display.
// Negative = counter-clockwise. Only defined for pieces that need rotation.
export const ARTWORK_ROTATION: Record<string, number> = {
  "a-cry-for-help": -90,
};
