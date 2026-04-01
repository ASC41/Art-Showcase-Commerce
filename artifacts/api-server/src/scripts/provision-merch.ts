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
import { printifyRequest, getShopId } from "../lib/printify";
import { eq } from "drizzle-orm";

const FORCE = process.argv.includes("--force");

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
  category: "apparel" | "accessories";
  displayOrder: number;
  /** subset of variants to enable (all colors/sizes we support) */
  variants: Array<{ id: number; color: string; size: string }>;
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
      "Heavyweight 50/50 cotton-poly fleece. Kangaroo pocket, double-lined hood. Large-format front print.",
    priceCents: 5500, // $55 — est cost ~$20 → ~64% margin
    estimatedCostCents: 2000,
    blueprintId: 77,
    printProviderId: 217,
    printAreaPosition: "front",
    printAreaWidth: 2976,
    printAreaHeight: 1982,
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

// ── Contained-dimensions helper (no-crop placement) ──────────────────────────
// Printify uses COVER semantics within the declared width×height bounding box:
// the image fills the box's shorter side and overflows the other — causing
// cropping when art ratio ≠ box ratio.
//
// Fix: declare width×height equal to the artwork's contained dimensions inside
// the print area (same aspect ratio as the artwork). At scale=1.0, COVER fills
// the ratio-matched box exactly — zero overflow, zero cropping.
function computeContainedDims(
  artworkW: number,
  artworkH: number,
  areaW: number,
  areaH: number
): { imgW: number; imgH: number } {
  const artRatio = artworkW / artworkH;
  const areaRatio = areaW / areaH;
  if (artRatio <= areaRatio) {
    // Art is more portrait — fit by height
    return { imgW: Math.round(areaH * artRatio), imgH: areaH };
  }
  // Art is more landscape — fit by width
  return { imgW: areaW, imgH: Math.round(areaW / artRatio) };
}

// ── Create a Printify product for a merch item ────────────────────────────────
async function createMerchProduct(
  shopId: string,
  config: MerchItemConfig,
  artwork: { title: string; imageUrl: string; imageWidth: number | null; imageHeight: number | null }
): Promise<{ productId: string; mockupImages: string[] }> {
  const artW = artwork.imageWidth ?? 2000;
  const artH = artwork.imageHeight ?? 2000;

  const { imgW, imgH } = computeContainedDims(
    artW, artH, config.printAreaWidth, config.printAreaHeight
  );

  // Build print areas - main position
  const positions = config.allPrintAreaPositions ?? [config.printAreaPosition];

  const printAreas = positions.map((pos) => ({
    variant_ids: config.variants.map((v) => v.id),
    placeholders: [
      {
        position: pos,
        images: [
          {
            id: "default", // Will be replaced by Printify after upload
            name: `${artwork.title} — ${config.name}`,
            type: "image/jpeg",
            height: imgH,
            width: imgW,
            x: 0.5,
            y: 0.5,
            scale: 1.0,
            angle: 0,
          },
        ],
      },
    ],
  }));

  // First, upload the image to Printify
  const uploadRes = await printifyRequest(`/uploads/images.json`, {
    method: "POST",
    body: JSON.stringify({
      file_name: `${artwork.title.toLowerCase().replace(/\s+/g, "-")}.jpg`,
      url: artwork.imageUrl,
    }),
  }) as { id: string };

  const imageId = uploadRes.id;

  // Build print areas with real image ID
  const printAreasWithId = positions.map((pos) => ({
    variant_ids: config.variants.map((v) => v.id),
    placeholders: [
      {
        position: pos,
        images: [
          {
            id: imageId,
            name: `${artwork.title} — ${config.name}`,
            type: "image/jpeg",
            height: imgH,
            width: imgW,
            x: 0.5,
            y: 0.5,
            scale: 1.0,
            angle: 0,
          },
        ],
      },
    ],
  }));

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
  console.log(`Mode: ${FORCE ? "FORCE (recreate all)" : "incremental (skip existing)"}\n`);

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

  for (const config of MERCH_CONFIG) {
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
