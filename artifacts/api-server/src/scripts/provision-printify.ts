/**
 * Printify Provisioning Script (v2 — orientation-aware + scale-to-fit)
 *
 * Creates Matte Poster and Framed Paper Poster products in Printify for every
 * artwork in the database, then stores the resulting product IDs back in the DB.
 *
 * Enhancements over v1:
 *  - Detects each artwork's pixel dimensions from its image URL
 *  - Uses portrait or landscape Printify variants based on artwork orientation
 *  - Uses scale-to-fit image placement so the entire artwork is always visible
 *    (white borders appear on the shorter dimension rather than cropping)
 *
 * Run once per artwork (idempotent — skips artworks that already have product IDs):
 *   pnpm --filter @workspace/api-server run provision-printify
 */

import https from "https";
import { db, artworksTable } from "@workspace/db";
import { eq, or, isNull } from "drizzle-orm";
import {
  printifyRequest,
  getShopId,
  loadPrintifyConfig,
  REQUIRED_PRINT_SIZES,
  PRINT_SIZE_INCHES_PORTRAIT,
  PRINT_SIZE_INCHES_LANDSCAPE,
  type PrintSize,
  type PrintOrientation,
} from "../lib/printify";

const PRINT_TYPE_LABELS = {
  matte: "Matte Poster",
  framed: "Framed Fine Art Print",
} as const;

const SIZE_LABELS_PORTRAIT: Record<PrintSize, string> = {
  "11x14": '11" × 14"',
  "18x24": '18" × 24"',
  "24x36": '24" × 36"',
};

const SIZE_LABELS_LANDSCAPE: Record<PrintSize, string> = {
  "11x14": '14" × 11"',
  "18x24": '24" × 18"',
  "24x36": '36" × 24"',
};

const PRINT_PRICES_CENTS: Record<"matte" | "framed", Record<PrintSize, number>> = {
  matte:  { "11x14": 4500, "18x24": 6500, "24x36": 9500 },
  framed: { "11x14": 8500, "18x24": 11500, "24x36": 16500 },
};

// ── Image dimension detection ─────────────────────────────────────────────────

function readJpegDimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function readPngDimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.slice(1, 4).toString() !== "PNG") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function fetchImageDimensions(
  url: string
): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const req = https.get(
      url,
      { headers: { Range: "bytes=0-65535" } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchImageDimensions(res.headers.location).then(resolve);
          return;
        }
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const dims = readJpegDimensions(buf) ?? readPngDimensions(buf);
          resolve(dims ?? null);
        });
        res.on("error", () => resolve(null));
      }
    );
    req.on("error", () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
  });
}

// ── Scale-to-fit calculation ──────────────────────────────────────────────────
// Printify scale=1.0 means the image fills the print width completely.
// If the image is taller relative to the print (artworkRatio < printRatio),
// the image will overflow the print height → we reduce scale to prevent that.
// Formula: scale = min(artworkRatio, printRatio) / max(artworkRatio, printRatio)
// This ensures the whole artwork fits within the print area with white borders
// on whichever dimension is shorter.
function calcScaleToFit(artworkW: number, artworkH: number, printW: number, printH: number): number {
  const artworkRatio = artworkW / artworkH;
  const printRatio = printW / printH;
  const scale = Math.min(artworkRatio, printRatio) / Math.max(artworkRatio, printRatio);
  // Clamp to [0.5, 1.0] — don't let very extreme ratios create tiny thumbnails
  return Math.max(0.5, Math.min(1.0, scale));
}

// ── Image upload ──────────────────────────────────────────────────────────────
async function uploadImage(imageUrl: string, slug: string): Promise<string> {
  console.log(`  Uploading artwork image...`);
  const result = (await printifyRequest("/uploads/images.json", {
    method: "POST",
    body: JSON.stringify({
      file_name: `${slug}.jpg`,
      url: imageUrl,
    }),
  })) as { id: string };
  console.log(`  Image uploaded → ID: ${result.id}`);
  return result.id;
}

// ── Product creation ──────────────────────────────────────────────────────────
async function createProduct(
  shopId: string,
  blueprintId: number,
  providerId: number,
  variantIds: Record<PrintSize, number>,
  imageId: string,
  artworkTitle: string,
  printType: "matte" | "framed",
  orientation: PrintOrientation,
  artworkW: number,
  artworkH: number
): Promise<string> {
  const typeLabel = PRINT_TYPE_LABELS[printType];
  const sizeLabels = orientation === "landscape" ? SIZE_LABELS_LANDSCAPE : SIZE_LABELS_PORTRAIT;
  const sizeInches = orientation === "landscape" ? PRINT_SIZE_INCHES_LANDSCAPE : PRINT_SIZE_INCHES_PORTRAIT;

  const variants = REQUIRED_PRINT_SIZES.map((size) => ({
    id: variantIds[size],
    price: PRINT_PRICES_CENTS[printType][size],
    is_enabled: true,
  }));

  // Build per-size scale-to-fit placements
  const placeholders = REQUIRED_PRINT_SIZES.map((size) => {
    const inches = sizeInches[size];
    const scale = calcScaleToFit(artworkW, artworkH, inches.w, inches.h);
    return {
      variant_ids: [variantIds[size]],
      placeholders: [
        {
          position: "front",
          images: [{ id: imageId, x: 0.5, y: 0.5, scale, angle: 0 }],
        },
      ],
    };
  });

  const product = (await printifyRequest(`/shops/${shopId}/products.json`, {
    method: "POST",
    body: JSON.stringify({
      title: `${artworkTitle} — ${typeLabel}`,
      description:
        `Fine art ${typeLabel.toLowerCase()} by Ryan Cellar. ` +
        `Archival quality, museum-grade materials. Available in three sizes: ` +
        REQUIRED_PRINT_SIZES.map((s) => sizeLabels[s]).join(", ") + `.`,
      blueprint_id: blueprintId,
      print_provider_id: providerId,
      variants,
      print_areas: placeholders,
    }),
  })) as { id: string };

  console.log(`  Created "${artworkTitle}" ${typeLabel} (${orientation}) → product ID: ${product.id}`);

  try {
    await printifyRequest(`/shops/${shopId}/products/${product.id}/publish.json`, {
      method: "POST",
      body: JSON.stringify({
        title: true,
        description: true,
        images: true,
        variants: true,
        tags: true,
        keyFeatures: true,
        shipping_template: true,
      }),
    });
    console.log(`  Published product ${product.id} ✓`);
  } catch (err) {
    console.warn(
      `  Publish attempt for product ${product.id} failed (non-fatal): ` +
        `${err instanceof Error ? err.message : String(err)}.`
    );
  }

  return product.id;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Printify Provisioning Script v2 (orientation-aware + scale-to-fit) ===\n");

  if (!process.env.PRINTIFY_API_KEY) {
    throw new Error("PRINTIFY_API_KEY is not set");
  }

  const config = loadPrintifyConfig();
  if (!config) {
    throw new Error(
      "Blueprint config not found. Ensure src/config/printify-blueprints.json exists " +
      "or set the PRINTIFY_BLUEPRINT_CONFIG environment variable."
    );
  }

  console.log("Blueprint config loaded:");
  console.log(`  Matte  → blueprint ${config.matte.blueprintId} / provider ${config.matte.printProviderId}`);
  console.log(`  Framed → blueprint ${config.framed.blueprintId} / provider ${config.framed.printProviderId}`);

  const shopId = await getShopId();
  console.log(`\nShop ID: ${shopId}\n`);

  const artworks = await db
    .select()
    .from(artworksTable)
    .where(
      or(
        isNull(artworksTable.printifyMatteProductId),
        isNull(artworksTable.printifyFramedProductId)
      )
    );

  console.log(`Found ${artworks.length} artwork(s) to provision\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const artwork of artworks) {
    console.log(`──── Processing: "${artwork.title}" (${artwork.slug})`);
    try {
      // Determine pixel dimensions (use stored values if available, otherwise fetch)
      let imgW = artwork.imageWidth;
      let imgH = artwork.imageHeight;

      if (!imgW || !imgH) {
        console.log(`  Fetching image dimensions from URL...`);
        const dims = await fetchImageDimensions(artwork.imageUrl);
        if (dims) {
          imgW = dims.w;
          imgH = dims.h;
          console.log(`  Dimensions: ${imgW}×${imgH}`);
        } else {
          console.warn(`  Could not determine image dimensions — defaulting to portrait, scale=0.95`);
          imgW = 3;
          imgH = 4; // fallback portrait
        }
        // Store dimensions in DB for future use
        await db
          .update(artworksTable)
          .set({ imageWidth: imgW, imageHeight: imgH })
          .where(eq(artworksTable.id, artwork.id));
      } else {
        console.log(`  Using stored dimensions: ${imgW}×${imgH}`);
      }

      const orientation: PrintOrientation = imgW > imgH ? "landscape" : "portrait";
      console.log(`  Orientation: ${orientation} (ratio: ${(imgW / imgH).toFixed(2)})`);

      const imageId = await uploadImage(artwork.imageUrl, artwork.slug);

      let matteProductId = artwork.printifyMatteProductId;
      if (!matteProductId) {
        matteProductId = await createProduct(
          shopId,
          config.matte.blueprintId,
          config.matte.printProviderId,
          config.matte.variantIds[orientation],
          imageId,
          artwork.title,
          "matte",
          orientation,
          imgW,
          imgH
        );
      } else {
        console.log(`  Matte product already exists (${matteProductId}), skipping.`);
      }

      let framedProductId = artwork.printifyFramedProductId;
      if (!framedProductId) {
        framedProductId = await createProduct(
          shopId,
          config.framed.blueprintId,
          config.framed.printProviderId,
          config.framed.variantIds[orientation],
          imageId,
          artwork.title,
          "framed",
          orientation,
          imgW,
          imgH
        );
      } else {
        console.log(`  Framed product already exists (${framedProductId}), skipping.`);
      }

      await db
        .update(artworksTable)
        .set({
          printifyMatteProductId: matteProductId,
          printifyFramedProductId: framedProductId,
        })
        .where(eq(artworksTable.id, artwork.id));

      console.log(`  Saved to DB ✓\n`);
      successCount++;
    } catch (err) {
      errorCount++;
      console.error(
        `  ERROR for "${artwork.title}": ${err instanceof Error ? err.message : String(err)}\n` +
          `  This artwork will be retried on the next run.\n`
      );
    }
  }

  console.log("=== Provisioning complete ===");
  console.log(`Results: ${successCount} succeeded, ${errorCount} failed`);
  console.log("\nPricing summary:");
  for (const size of REQUIRED_PRINT_SIZES) {
    console.log(
      `  ${SIZE_LABELS_PORTRAIT[size]} / ${SIZE_LABELS_LANDSCAPE[size]}: ` +
        `Matte $${PRINT_PRICES_CENTS.matte[size] / 100}  ·  ` +
        `Framed $${PRINT_PRICES_CENTS.framed[size] / 100}`
    );
  }

  if (errorCount > 0) {
    console.error(`\n${errorCount} artwork(s) failed — re-run to retry.`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Provisioning script failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
