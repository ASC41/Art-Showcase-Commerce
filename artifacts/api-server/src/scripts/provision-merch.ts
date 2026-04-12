/**
 * provision-merch.ts
 *
 * Creates one Printify "template" product per merch type using the default artwork,
 * then pulls the auto-generated mockup images and stores everything in the DB.
 *
 * Run: pnpm --filter @workspace/api-server run provision-merch
 *
 * Re-running will skip items that already have a printifyProductId unless --force is passed.
 */

import { db, artworksTable } from "@workspace/db";
import { merchProductsTable } from "@workspace/db/schema";
import type { SignatureConfig } from "@workspace/db/schema";
import { printifyRequest, getShopId } from "../lib/printify";
import { eq } from "drizzle-orm";

const FORCE = process.argv.includes("--force");
// Optional: scope to a single product slug (e.g. --slug hoodie)
const SLUG_FILTER = (() => {
  const idx = process.argv.indexOf("--slug");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

// ── Default artwork for mockup generation ────────────────────────────────────
const DEFAULT_ARTWORK_SLUG = "grin-and-bear-it";

// ── Merch product config ──────────────────────────────────────────────────────
interface MerchItemConfig {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  estimatedCostCents: number; // used for margin tracking
  blueprintId: number;
  printProviderId: number;
  printAreaPosition: string; // primary print area
  allPrintAreaPositions?: string[]; // extra positions (socks have 4)
  printAreaWidth: number;
  printAreaHeight: number;
  category: "apparel" | "accessories" | "print";
  displayOrder: number;
  /** subset of variants to enable (all colors/sizes we support) */
  variants: Array<{ id: number; color: string; size: string }>;
  /**
   * Optional: secondary print area with a color-aware wordmark/signature.
   * When set, createMerchProduct builds two print_areas groups so dark
   * garments get the white wordmark and light garments get the black one.
   */
  signatureConfig?: SignatureConfig;
}

const MERCH_CONFIG: MerchItemConfig[] = [
  // ── YOUR 6 ITEMS ────────────────────────────────────────────────────────────
  {
    slug: "tshirt",
    name: "Comfort Colors T-Shirt",
    description:
      "Garment-dyed for a lived-in feel. Premium DTG print on 100% ring-spun cotton. Limited-edition artwork on every piece.",
    priceCents: 3200, // $32 — est cost ~$14 → ~56% margin
    estimatedCostCents: 1400,
    blueprintId: 706,
    printProviderId: 217,
    printAreaPosition: "front",
    printAreaWidth: 3461,
    printAreaHeight: 3955,
    category: "apparel",
    displayOrder: 1,
    variants: [
      { id: 73196, color: "Black", size: "S" },
      { id: 73200, color: "Black", size: "M" },
      { id: 73204, color: "Black", size: "L" },
      { id: 73208, color: "Black", size: "XL" },
      { id: 73212, color: "Black", size: "2XL" },
      { id: 73199, color: "White", size: "S" },
      { id: 73203, color: "White", size: "M" },
      { id: 73207, color: "White", size: "L" },
      { id: 73211, color: "White", size: "XL" },
      { id: 73215, color: "White", size: "2XL" },
    ],
  },
  {
    slug: "hoodie",
    name: "Gildan Pullover Hoodie",
    description:
      "Heavyweight 50/50 cotton-poly fleece. Kangaroo pocket, double-lined hood. Large-format artwork on the back, artist signature embroidered on the chest.",
    priceCents: 5500, // $55 — est cost ~$20 → ~64% margin
    estimatedCostCents: 2000,
    blueprintId: 77,
    printProviderId: 217,
    // Primary artwork: full back — 2976×3398 portrait, much larger than the front strip.
    // Artwork is always contain-scaled to honor each painting's orientation.
    printAreaPosition: "back",
    printAreaWidth: 2976,
    printAreaHeight: 3398,
    category: "apparel",
    displayOrder: 2,
    variants: [
      { id: 32918, color: "Black", size: "S" },
      { id: 32919, color: "Black", size: "M" },
      { id: 32920, color: "Black", size: "L" },
      { id: 32921, color: "Black", size: "XL" },
      { id: 32922, color: "Black", size: "2XL" },
      { id: 32894, color: "Navy", size: "S" },
      { id: 32895, color: "Navy", size: "M" },
      { id: 32896, color: "Navy", size: "L" },
      { id: 32897, color: "Navy", size: "XL" },
      { id: 32898, color: "Navy", size: "2XL" },
      { id: 32910, color: "White", size: "S" },
      { id: 32911, color: "White", size: "M" },
      { id: 32912, color: "White", size: "L" },
      { id: 32913, color: "White", size: "XL" },
      { id: 32914, color: "White", size: "2XL" },
    ],
    // Color-aware signature: white wordmark on dark garments, black on white.
    signatureConfig: {
      position: "front_left_chest",
      whiteWordmarkUrl:
        "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@475907b09a0969a684bac008d7aca675f3138ef4/uploads/2026-04-12T05-30-52-237Z-pd2wptkwr.png",
      blackWordmarkUrl:
        "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@232b3d5040a133da0e8c0c29a46a9dc28016d2f8/uploads/2026-04-12T05-31-45-372Z-upz8q5hd4.png",
      // Black + Navy → white wordmark so it shows on dark fabric
      darkVariantIds: [32918, 32919, 32920, 32921, 32922, 32894, 32895, 32896, 32897, 32898],
      // White → black wordmark so it shows on light fabric
      lightVariantIds: [32910, 32911, 32912, 32913, 32914],
      areaWidth: 1200,
      areaHeight: 1200,
    },
  },
  {
    slug: "crewneck",
    name: "Gildan Crewneck Sweatshirt",
    description:
      "Classic heavyweight crewneck with a clean canvas for bold prints. 50/50 cotton-poly fleece.",
    priceCents: 4500, // $45 — est cost ~$17 → ~62% margin
    estimatedCostCents: 1700,
    blueprintId: 49,
    printProviderId: 217,
    printAreaPosition: "front",
    printAreaWidth: 2976,
    printAreaHeight: 3398,
    category: "apparel",
    displayOrder: 3,
    variants: [
      { id: 25397, color: "Black", size: "S" },
      { id: 25428, color: "Black", size: "M" },
      { id: 25459, color: "Black", size: "L" },
      { id: 25490, color: "Black", size: "XL" },
      { id: 25521, color: "Black", size: "2XL" },
      { id: 25388, color: "Navy", size: "S" },
      { id: 25419, color: "Navy", size: "M" },
      { id: 25450, color: "Navy", size: "L" },
      { id: 25481, color: "Navy", size: "XL" },
      { id: 25512, color: "Navy", size: "2XL" },
      { id: 25396, color: "White", size: "S" },
      { id: 25427, color: "White", size: "M" },
      { id: 25458, color: "White", size: "L" },
      { id: 25489, color: "White", size: "XL" },
      { id: 25520, color: "White", size: "2XL" },
    ],
  },
  {
    slug: "dad-cap",
    name: "Classic Dad Cap",
    description:
      "Yupoong structured 6-panel cap with a low profile. Artwork embroidered on the front panel.",
    priceCents: 3500, // $35 — est cost ~$13 → ~63% margin
    estimatedCostCents: 1300,
    blueprintId: 1447,
    printProviderId: 99,
    printAreaPosition: "front",
    printAreaWidth: 1200,
    printAreaHeight: 675,
    category: "accessories",
    displayOrder: 4,
    variants: [
      { id: 105372, color: "Black", size: "One size" },
      { id: 105373, color: "Dark Grey", size: "One size" },
      { id: 105377, color: "Navy", size: "One size" },
      { id: 105375, color: "Khaki", size: "One size" },
      { id: 105381, color: "White", size: "One size" },
    ],
  },
  {
    slug: "phone-case",
    name: "Tough Phone Case",
    description:
      "Dual-layer protection with full artwork coverage. Matte finish. Compatible with iPhone 12–16 and Samsung Galaxy S22–S24.",
    priceCents: 2800, // $28 — est cost ~$9 → ~68% margin
    estimatedCostCents: 900,
    blueprintId: 421,
    printProviderId: 23,
    printAreaPosition: "front",
    printAreaWidth: 1152,
    printAreaHeight: 1853,
    category: "accessories",
    displayOrder: 5,
    variants: [
      { id: 67999, color: "Matte", size: "iPhone 12" },
      { id: 68001, color: "Matte", size: "iPhone 12 Pro" },
      { id: 68003, color: "Matte", size: "iPhone 12 Pro Max" },
      { id: 75384, color: "Matte", size: "iPhone 13" },
      { id: 75388, color: "Matte", size: "iPhone 13 Pro" },
      { id: 75390, color: "Matte", size: "iPhone 13 Pro Max" },
      { id: 96398, color: "Matte", size: "iPhone 14" },
      { id: 96400, color: "Matte", size: "iPhone 14 Pro" },
      { id: 96404, color: "Matte", size: "iPhone 14 Pro Max" },
      { id: 102548, color: "Matte", size: "iPhone 15" },
      { id: 102552, color: "Matte", size: "iPhone 15 Pro" },
      { id: 102554, color: "Matte", size: "iPhone 15 Pro Max" },
      { id: 112192, color: "Matte", size: "iPhone 16" },
      { id: 112196, color: "Matte", size: "iPhone 16 Pro" },
      { id: 112198, color: "Matte", size: "iPhone 16 Pro Max" },
      { id: 80153, color: "Matte", size: "Samsung Galaxy S22" },
      { id: 96739, color: "Matte", size: "Samsung Galaxy S23" },
      { id: 105149, color: "Matte", size: "Samsung Galaxy S24" },
    ],
  },
  {
    slug: "tote-bag",
    name: "All-Over Print Tote Bag",
    description:
      "Full artwork coverage on every surface. Heavy-duty canvas straps. 13″, 16″, or 18″ sizes.",
    priceCents: 4500, // $45 — est cost ~$18 → ~60% margin
    estimatedCostCents: 1800,
    blueprintId: 1389,
    printProviderId: 10,
    printAreaPosition: "front",
    printAreaWidth: 2175,
    printAreaHeight: 4350,
    category: "accessories",
    displayOrder: 6,
    variants: [
      { id: 103599, color: "Black", size: '13" × 13"' },
      { id: 103600, color: "Black", size: '16" × 16"' },
      { id: 103601, color: "Black", size: '18" × 18"' },
      { id: 103605, color: "White", size: '13" × 13"' },
      { id: 103606, color: "White", size: '16" × 16"' },
      { id: 103607, color: "White", size: '18" × 18"' },
    ],
  },

  // ── 4 ADDITIONS FOR 18-35 INSTAGRAM/TIKTOK AUDIENCE ────────────────────────
  {
    slug: "cuff-beanie",
    name: "Cuff Beanie",
    description:
      "A winter essential with artwork embroidered across the front. One size fits all.",
    priceCents: 3200, // $32 — est cost ~$11 → ~66% margin
    estimatedCostCents: 1100,
    blueprintId: 1689,
    printProviderId: 217,
    printAreaPosition: "front",
    printAreaWidth: 1500,
    printAreaHeight: 526,
    category: "accessories",
    displayOrder: 7,
    variants: [
      { id: 116203, color: "Black", size: "One size" },
      { id: 116211, color: "Navy", size: "One size" },
      { id: 116206, color: "Ecru", size: "One size" },
      { id: 116201, color: "Army", size: "One size" },
    ],
  },
  {
    slug: "crew-socks",
    name: "Art Crew Socks",
    description:
      "Full all-over artwork on both legs. Cushioned sole, 3/4 crew or ankle height. One size fits most.",
    priceCents: 2200, // $22 — est cost ~$8 → ~64% margin
    estimatedCostCents: 800,
    blueprintId: 365,
    printProviderId: 14,
    printAreaPosition: "front_left_leg",
    allPrintAreaPositions: ["front_left_leg", "front_right_leg", "back_left_leg", "back_right_leg"],
    printAreaWidth: 1358,
    printAreaHeight: 3839,
    category: "accessories",
    displayOrder: 8,
    variants: [
      { id: 44905, color: "White", size: "Ankle" },
      { id: 44906, color: "White", size: "Crew" },
    ],
  },
  {
    slug: "bucket-hat",
    name: "Bucket Hat",
    description:
      "The festival staple. Artwork-forward front panel, adjustable brim. Wears well in photos.",
    priceCents: 3200, // $32 — est cost ~$12 → ~63% margin
    estimatedCostCents: 1200,
    blueprintId: 1698,
    printProviderId: 217,
    printAreaPosition: "front",
    printAreaWidth: 1500,
    printAreaHeight: 705,
    category: "accessories",
    displayOrder: 9,
    variants: [
      { id: 116654, color: "Black", size: "One size" },
      { id: 116660, color: "Navy", size: "One size" },
      { id: 116655, color: "Bone", size: "One size" },
      { id: 116659, color: "Ecru", size: "One size" },
    ],
  },
  {
    slug: "sweat-shorts",
    name: "Sponge Fleece Sweat Shorts",
    description:
      "Athleisure made for content. Soft sponge fleece, elastic waistband, artwork on the left leg.",
    priceCents: 4800, // $48 — est cost ~$19 → ~60% margin
    estimatedCostCents: 1900,
    blueprintId: 2048,
    printProviderId: 29,
    printAreaPosition: "left_leg_front",
    printAreaWidth: 1200,
    printAreaHeight: 1920,
    category: "apparel",
    displayOrder: 10,
    variants: [
      { id: 125500, color: "Black", size: "S" },
      { id: 125498, color: "Black", size: "M" },
      { id: 125496, color: "Black", size: "L" },
      { id: 125502, color: "Black", size: "XL" },
      { id: 125494, color: "Black", size: "2XL" },
    ],
  },

  // ── MATTE ART POSTER ─────────────────────────────────────────────────────────
  {
    slug: "matte-poster",
    name: "Matte Art Poster",
    description:
      "Museum-quality matte finish. Deep blacks, vivid color. Each print is made to order — artwork looks better in person.",
    priceCents: 2000, // $20 — est cost ~$6 → ~70% margin
    estimatedCostCents: 600,
    blueprintId: 282,
    printProviderId: 2,
    printAreaPosition: "front",
    printAreaWidth: 3300,
    printAreaHeight: 4200,
    category: "print",
    displayOrder: 11,
    variants: [
      { id: 43135, color: "Matte", size: '11" × 14"' },
      { id: 43138, color: "Matte", size: '12" × 18"' },
      { id: 43141, color: "Matte", size: '16" × 20"' },
      { id: 43144, color: "Matte", size: '18" × 24"' },
    ],
  },
];

// ── Scale-to-contain helper ───────────────────────────────────────────────────
// KEY FACT: Printify IGNORES the width/height fields — it always normalizes them
// to the actual uploaded image's pixel dimensions. Only `scale` matters.
//
// At scale=1.0 Printify uses COVER: fills the print area by whichever dimension
// requires the LARGER scale-up factor; the other dimension overflows → cropped.
//
// CONTAIN scale = min(artRatio, areaRatio) / max(artRatio, areaRatio)
//   → always ≤ 1.0; at this scale the overflowing dimension exactly fits.
//
// Example: portrait art (0.664) in portrait t-shirt area (0.875):
//   fill-by-width factor = 3461/691 = 5.007  (larger → Printify uses this)
//   fill-by-height factor = 3955/1041 = 3.799
//   scale = 3.799/5.007 = 0.759
//   → at 0.759, height renders to 3955px exactly → no overflow → no cropping.
function computeScale(
  artworkW: number,
  artworkH: number,
  areaW: number,
  areaH: number
): number {
  const artRatio = artworkW / artworkH;
  const areaRatio = areaW / areaH;
  return Math.min(artRatio, areaRatio) / Math.max(artRatio, areaRatio);
}

// ── Create a Printify product for a merch item ────────────────────────────────
async function createMerchProduct(
  shopId: string,
  config: MerchItemConfig,
  artwork: { title: string; imageUrl: string; imageWidth: number | null; imageHeight: number | null }
): Promise<{ productId: string; mockupImages: string[] }> {
  const artW = artwork.imageWidth ?? 2000;
  const artH = artwork.imageHeight ?? 2000;

  // Scale-to-contain: fills as much of the print area as possible without
  // cropping, honouring each painting's natural orientation (portrait/landscape/square).
  const artworkScale = computeScale(artW, artH, config.printAreaWidth, config.printAreaHeight);

  // Upload the artwork image to Printify
  const uploadRes = await printifyRequest(`/uploads/images.json`, {
    method: "POST",
    body: JSON.stringify({
      file_name: `${artwork.title.toLowerCase().replace(/\s+/g, "-")}.jpg`,
      url: artwork.imageUrl,
    }),
  }) as { id: string };
  const imageId = uploadRes.id;

  // ── Build print_areas array ──────────────────────────────────────────────
  let printAreasWithId: object[];

  const sig = config.signatureConfig;

  if (sig) {
    // Products with a color-aware signature (e.g. hoodie):
    //   • Two print_areas groups split by dark vs light variant IDs.
    //   • Each group gets the artwork on the primary position (back) AND
    //     the correct wordmark on the secondary position (front_left_chest).
    //   • Artwork scale-to-contain is always computed from the actual image dims.

    // Upload both wordmarks in parallel.
    // Printify returns the actual pixel dims of each uploaded file —
    // use those to contain-scale the wordmark against the embroidery area.
    const [whiteUpload, blackUpload] = await Promise.all([
      printifyRequest(`/uploads/images.json`, {
        method: "POST",
        body: JSON.stringify({
          file_name: "wordmark-white.png",
          url: sig.whiteWordmarkUrl,
        }),
      }) as Promise<{ id: string; width: number; height: number }>,
      printifyRequest(`/uploads/images.json`, {
        method: "POST",
        body: JSON.stringify({
          file_name: "wordmark-black.png",
          url: sig.blackWordmarkUrl,
        }),
      }) as Promise<{ id: string; width: number; height: number }>,
    ]);

    // Contain-scale: same formula as artwork — prevents embroidery area overflow.
    const whiteWordmarkScale = computeScale(
      whiteUpload.width ?? sig.areaWidth,
      whiteUpload.height ?? sig.areaHeight,
      sig.areaWidth,
      sig.areaHeight
    );
    const blackWordmarkScale = computeScale(
      blackUpload.width ?? sig.areaWidth,
      blackUpload.height ?? sig.areaHeight,
      sig.areaWidth,
      sig.areaHeight
    );

    const artworkPlaceholder = (imgId: string) => ({
      position: config.printAreaPosition,
      images: [
        {
          id: imgId,
          name: `${artwork.title} — ${config.name}`,
          type: "image/jpeg",
          width: artW,
          height: artH,
          x: 0.5,
          y: 0.5,
          scale: artworkScale,
          angle: 0,
        },
      ],
    });

    const signaturePlaceholder = (wordmarkId: string, wordmarkScale: number) => ({
      position: sig.position,
      images: [
        {
          id: wordmarkId,
          name: "Artist Signature",
          type: "image/png",
          width: sig.areaWidth,
          height: sig.areaHeight,
          x: 0.5,
          y: 0.5,
          scale: wordmarkScale,
          angle: 0,
        },
      ],
    });

    printAreasWithId = [
      // Dark variants (Black, Navy) → white wordmark
      {
        variant_ids: sig.darkVariantIds,
        placeholders: [
          artworkPlaceholder(imageId),
          signaturePlaceholder(whiteUpload.id, whiteWordmarkScale),
        ],
      },
      // Light variants (White) → black wordmark
      {
        variant_ids: sig.lightVariantIds,
        placeholders: [
          artworkPlaceholder(imageId),
          signaturePlaceholder(blackUpload.id, blackWordmarkScale),
        ],
      },
    ];
  } else {
    // Standard products: single group covering all variants, one or more positions.
    const positions = config.allPrintAreaPositions ?? [config.printAreaPosition];
    printAreasWithId = positions.map((pos) => ({
      variant_ids: config.variants.map((v) => v.id),
      placeholders: [
        {
          position: pos,
          images: [
            {
              id: imageId,
              name: `${artwork.title} — ${config.name}`,
              type: "image/jpeg",
              width: artW,
              height: artH,
              x: 0.5,
              y: 0.5,
              scale: artworkScale,
              angle: 0,
            },
          ],
        },
      ],
    }));
  }

  const product = await printifyRequest(`/shops/${shopId}/products.json`, {
    method: "POST",
    body: JSON.stringify({
      title: `${artwork.title} — ${config.name}`,
      blueprint_id: config.blueprintId,
      print_provider_id: config.printProviderId,
      variants: config.variants.map((v) => ({
        id: v.id,
        price: config.priceCents,
        is_enabled: true,
      })),
      print_areas: printAreasWithId,
    }),
  }) as {
    id: string;
    images: Array<{ src: string; position: string; is_default: boolean }>;
  };

  const mockupImages = (product.images ?? [])
    .filter((img) => img.src)
    .map((img) => img.src)
    .slice(0, 6); // keep up to 6 mockup images

  return { productId: product.id, mockupImages };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Merch Provisioning Script ===");
  console.log(`Mode: ${FORCE ? "FORCE (recreate all)" : "incremental (skip existing)"}`);
  if (SLUG_FILTER) console.log(`Scoped to: ${SLUG_FILTER}`);
  console.log();

  const shopId = await getShopId();
  console.log(`Shop ID: ${shopId}\n`);

  // Fetch default artwork
  const [defaultArtwork] = await db
    .select()
    .from(artworksTable)
    .where(eq(artworksTable.slug, DEFAULT_ARTWORK_SLUG));

  if (!defaultArtwork) {
    throw new Error(`Default artwork '${DEFAULT_ARTWORK_SLUG}' not found in DB`);
  }
  console.log(`Default artwork: ${defaultArtwork.title} (${defaultArtwork.imageUrl.substring(0, 60)}...)\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  const configsToRun = SLUG_FILTER
    ? MERCH_CONFIG.filter((c) => c.slug === SLUG_FILTER)
    : MERCH_CONFIG;

  if (SLUG_FILTER && configsToRun.length === 0) {
    throw new Error(`No merch config found for slug '${SLUG_FILTER}'`);
  }

  for (const config of configsToRun) {
    const margin = (((config.priceCents - config.estimatedCostCents) / config.priceCents) * 100).toFixed(0);
    console.log(`\n[${config.displayOrder}/10] ${config.name} (${config.slug})`);
    console.log(`  Price: $${(config.priceCents / 100).toFixed(2)} | Est cost: $${(config.estimatedCostCents / 100).toFixed(2)} | Margin: ~${margin}%`);

    // Check if already exists
    const [existing] = await db
      .select({ id: merchProductsTable.id, printifyProductId: merchProductsTable.printifyProductId })
      .from(merchProductsTable)
      .where(eq(merchProductsTable.slug, config.slug));

    if (existing?.printifyProductId && !FORCE) {
      console.log(`  ✓ Already provisioned (product ID: ${existing.printifyProductId}) — skipping`);
      skipped++;
      continue;
    }

    try {
      console.log(`  → Creating Printify product...`);
      const { productId, mockupImages } = await createMerchProduct(shopId, config, {
        title: defaultArtwork.title,
        imageUrl: defaultArtwork.imageUrl,
        imageWidth: defaultArtwork.imageWidth,
        imageHeight: defaultArtwork.imageHeight,
      });

      console.log(`  ✓ Product created: ${productId}`);
      console.log(`  ✓ Mockup images: ${mockupImages.length}`);

      const record = {
        slug: config.slug,
        name: config.name,
        description: config.description,
        priceCents: config.priceCents,
        estimatedCostCents: config.estimatedCostCents,
        blueprintId: config.blueprintId,
        printProviderId: config.printProviderId,
        printAreaPosition: config.printAreaPosition,
        printAreaWidth: config.printAreaWidth,
        printAreaHeight: config.printAreaHeight,
        printifyProductId: productId,
        mockupImages,
        variants: config.variants.map((v) => ({
          id: v.id,
          title: `${v.color} / ${v.size}`,
          color: v.color,
          size: v.size,
        })),
        signatureConfig: config.signatureConfig ?? null,
        category: config.category,
        displayOrder: config.displayOrder,
        isActive: true,
      };

      if (existing) {
        await db
          .update(merchProductsTable)
          .set(record)
          .where(eq(merchProductsTable.slug, config.slug));
        console.log(`  ✓ DB record updated`);
      } else {
        await db.insert(merchProductsTable).values(record);
        console.log(`  ✓ DB record inserted`);
      }

      success++;
    } catch (err) {
      console.error(`  ✗ FAILED: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }

    // Small delay to be respectful to Printify API
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n=== Done: ${success} created, ${skipped} skipped, ${failed} failed ===`);

  // Print margin summary
  console.log("\n=== Pricing & Margin Summary ===");
  for (const config of MERCH_CONFIG) {
    const margin = (((config.priceCents - config.estimatedCostCents) / config.priceCents) * 100).toFixed(0);
    const flag = parseInt(margin) >= 40 ? "✓" : parseInt(margin) >= 35 ? "~" : "⚠";
    console.log(
      `  ${flag} ${config.name.padEnd(32)} $${(config.priceCents / 100).toFixed(2).padStart(5)} retail | ~$${(config.estimatedCostCents / 100).toFixed(2)} cost | ${margin}% margin`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
