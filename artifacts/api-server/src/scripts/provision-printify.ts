/**
 * Printify Provisioning Script (v3 — Giclée Art Print only)
 *
 * Creates Giclée Art Print products (Blueprint 494, Provider 36) in Printify
 * for every artwork in the database, then stores the resulting product IDs back
 * in the DB under printifyMatteProductId (repurposed for Giclée).
 *
 * Also clears printifyFramedProductId for all artworks.
 *
 * Sizes available:
 *   Portrait:  8×11, 11×14, 12×18, 16×20
 *   Landscape: 11×8, 14×11, 18×12, 20×16
 *
 * Pricing (cents):
 *   8×11  → $35  |  11×14 → $55  |  12×18 → $75  |  16×20 → $95
 *
 * Run once per artwork (idempotent — skips artworks that already have a product ID):
 *   pnpm --filter @workspace/api-server run provision-printify
 *
 * Force re-provision all artworks:
 *   pnpm --filter @workspace/api-server run provision-printify --force
 */

import https from "https";
import { db, artworksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  printifyRequest,
  getShopId,
  REQUIRED_PRINT_SIZES,
  PRINT_SIZE_INCHES_PORTRAIT,
  PRINT_SIZE_INCHES_LANDSCAPE,
  GICLEE_VARIANT_IDS,
  type PrintSize,
  type PrintOrientation,
} from "../lib/printify";

const FORCE = process.argv.includes("--force");

const GICLEE_BLUEPRINT_ID = 494;
const GICLEE_PROVIDER_ID = 36;

const SIZE_LABELS_PORTRAIT: Record<PrintSize, string> = {
  "8x11":  '8" × 11"',
  "11x14": '11" × 14"',
  "12x18": '12" × 18"',
  "16x20": '16" × 20"',
};

const SIZE_LABELS_LANDSCAPE: Record<PrintSize, string> = {
  "8x11":  '11" × 8"',
  "11x14": '14" × 11"',
  "12x18": '18" × 12"',
  "16x20": '20" × 16"',
};

const GICLEE_PRICES_CENTS: Record<PrintSize, number> = {
  "8x11":  3500,
  "11x14": 5500,
  "12x18": 7500,
  "16x20": 9500,
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

// ── Equal-border scale for Giclée prints ─────────────────────────────────────
// Standard CONTAIN fills one axis flush to the edge, leaving bars on the other.
// This redistributes the white space so all four margins are equal pixels.
function gicleeScaleFor(artW: number, artH: number, areaW: number, areaH: number): number {
  const ar = artW / artH;
  const containS = Math.min(ar, areaW / areaH) / Math.max(ar, areaW / areaH);
  const denom = areaW * (1 - 1 / ar);
  const equalBorderS = Math.abs(denom) > 0.5 ? (areaW - areaH) / denom : containS;
  return Math.max(Math.min(equalBorderS, containS * 0.90), containS * 0.70);
}

// ── Print area dimensions for each variant (Giclée Blueprint 494) ─────────────
const GICLEE_AREA_PORTRAIT: Record<PrintSize, { w: number; h: number }> = {
  "8x11":  { w: 2400, h: 3300 },
  "11x14": { w: 3300, h: 4200 },
  "12x18": { w: 3600, h: 5400 },
  "16x20": { w: 4800, h: 6000 },
};

const GICLEE_AREA_LANDSCAPE: Record<PrintSize, { w: number; h: number }> = {
  "8x11":  { w: 3300, h: 2400 },
  "11x14": { w: 4200, h: 3300 },
  "12x18": { w: 5400, h: 3600 },
  "16x20": { w: 6000, h: 4800 },
};

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
async function createGicleeProduct(
  shopId: string,
  imageId: string,
  artworkTitle: string,
  orientation: PrintOrientation,
  artworkW: number,
  artworkH: number
): Promise<string> {
  const variantIds = GICLEE_VARIANT_IDS[orientation];
  const sizeLabels = orientation === "landscape" ? SIZE_LABELS_LANDSCAPE : SIZE_LABELS_PORTRAIT;
  const areas = orientation === "landscape" ? GICLEE_AREA_LANDSCAPE : GICLEE_AREA_PORTRAIT;

  const variants = REQUIRED_PRINT_SIZES.map((size) => ({
    id: variantIds[size],
    price: GICLEE_PRICES_CENTS[size],
    is_enabled: true,
  }));

  // Build per-size equal-border placements
  const printAreas = REQUIRED_PRINT_SIZES.map((size) => {
    const area = areas[size];
    const scale = gicleeScaleFor(artworkW, artworkH, area.w, area.h);
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
      title: `${artworkTitle} — Giclée Art Print`,
      description:
        `Fine art Giclée print by Ryan Cellar. ` +
        `Archival pigment inks on premium cotton-rag paper. Gallery-quality reproduction made to order. ` +
        `Available in four sizes: ` +
        REQUIRED_PRINT_SIZES.map((s) => sizeLabels[s]).join(", ") + `.`,
      blueprint_id: GICLEE_BLUEPRINT_ID,
      print_provider_id: GICLEE_PROVIDER_ID,
      variants,
      print_areas: printAreas,
    }),
  })) as { id: string };

  console.log(`  Created "${artworkTitle}" Giclée Art Print (${orientation}) → product ID: ${product.id}`);

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
  console.log("=== Printify Provisioning Script v3 (Giclée Art Print — Blueprint 494) ===\n");

  if (!process.env.PRINTIFY_API_KEY) {
    throw new Error("PRINTIFY_API_KEY is not set");
  }

  console.log(`Blueprint: ${GICLEE_BLUEPRINT_ID} (Giclée Art Print)`);
  console.log(`Provider:  ${GICLEE_PROVIDER_ID} (Print Pigeons)`);
  console.log(`Sizes:     ${REQUIRED_PRINT_SIZES.join(", ")}`);
  console.log(`Pricing:   ${REQUIRED_PRINT_SIZES.map((s) => `${s}=$${GICLEE_PRICES_CENTS[s] / 100}`).join("  ")}\n`);

  const shopId = await getShopId();
  console.log(`Shop ID: ${shopId}\n`);

  const artworks = await db.select().from(artworksTable);

  const toProcess = FORCE
    ? artworks
    : artworks.filter((a) => !a.printifyMatteProductId);

  console.log(`Found ${artworks.length} total artwork(s), ${toProcess.length} to provision\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const artwork of toProcess) {
    console.log(`──── Processing: "${artwork.title}" (${artwork.slug})`);
    try {
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
          console.warn(`  Could not determine image dimensions — defaulting to portrait`);
          imgW = 3;
          imgH = 4;
        }
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

      const gicleeProductId = await createGicleeProduct(
        shopId,
        imageId,
        artwork.title,
        orientation,
        imgW,
        imgH
      );

      await db
        .update(artworksTable)
        .set({
          printifyMatteProductId: gicleeProductId,
          printifyFramedProductId: null,
        })
        .where(eq(artworksTable.id, artwork.id));

      console.log(`  Saved to DB ✓ (printifyMatteProductId = ${gicleeProductId}, printifyFramedProductId = null)\n`);
      successCount++;
    } catch (err) {
      errorCount++;
      console.error(
        `  ERROR for "${artwork.title}": ${err instanceof Error ? err.message : String(err)}\n` +
          `  This artwork will be retried on the next run.\n`
      );
    }
  }

  // Clear framed product IDs for any artworks not re-provisioned this run
  if (!FORCE) {
    const remaining = artworks.filter((a) => a.printifyFramedProductId && a.printifyMatteProductId);
    if (remaining.length > 0) {
      console.log(`\nClearing ${remaining.length} stale printifyFramedProductId entries...`);
      for (const artwork of remaining) {
        await db
          .update(artworksTable)
          .set({ printifyFramedProductId: null })
          .where(eq(artworksTable.id, artwork.id));
      }
      console.log(`  Done ✓`);
    }
  }

  console.log("\n=== Provisioning complete ===");
  console.log(`Results: ${successCount} succeeded, ${errorCount} failed`);

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
