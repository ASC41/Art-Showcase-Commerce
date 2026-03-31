/**
 * Printify Provisioning Script
 *
 * Creates Matte Poster and Framed Paper Poster products in Printify for every
 * artwork in the database, then stores the resulting product IDs back in the DB.
 *
 * Requires src/config/printify-blueprints.json (or PRINTIFY_BLUEPRINT_CONFIG
 * env var) to be present with blueprint IDs, provider IDs, and variant IDs.
 * These are already pre-configured for:
 *   Matte  → Blueprint 983  (Matte Posters)     / Provider 95  (Ideju Druka)
 *   Framed → Blueprint 1236 (Framed Paper Posters) / Provider 105 (Jondo) / Fine Art
 *
 * Run once (idempotent — skips artworks that already have product IDs):
 *   pnpm --filter @workspace/api-server run provision-printify
 */

import { db, artworksTable } from "@workspace/db";
import { eq, or, isNull } from "drizzle-orm";
import {
  printifyRequest,
  getShopId,
  loadPrintifyConfig,
  REQUIRED_PRINT_SIZES,
  type PrintSize,
} from "../lib/printify";

const PRINT_TYPE_LABELS = {
  matte: "Matte Poster",
  framed: "Framed Fine Art Print",
} as const;

const SIZE_LABELS: Record<PrintSize, string> = {
  "11x14": '11" × 14"',
  "18x24": '18" × 24"',
  "24x36": '24" × 36"',
};

const PRINT_PRICES_CENTS: Record<"matte" | "framed", Record<PrintSize, number>> = {
  matte:  { "11x14": 4500, "18x24": 6500, "24x36": 9500 },
  framed: { "11x14": 8500, "18x24": 11500, "24x36": 16500 },
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
async function createProduct(
  shopId: string,
  blueprintId: number,
  providerId: number,
  variantIds: Record<PrintSize, number>,
  imageId: string,
  artworkTitle: string,
  printType: "matte" | "framed"
): Promise<string> {
  const typeLabel = PRINT_TYPE_LABELS[printType];

  const variants = REQUIRED_PRINT_SIZES.map((size) => ({
    id: variantIds[size],
    price: PRINT_PRICES_CENTS[printType][size],
    is_enabled: true,
  }));

  const product = (await printifyRequest(`/shops/${shopId}/products.json`, {
    method: "POST",
    body: JSON.stringify({
      title: `${artworkTitle} — ${typeLabel}`,
      description:
        `Fine art ${typeLabel.toLowerCase()} by Ryan Cellar. ` +
        `Archival quality, museum-grade materials. Available in three sizes.`,
      blueprint_id: blueprintId,
      print_provider_id: providerId,
      variants,
      print_areas: [
        {
          variant_ids: REQUIRED_PRINT_SIZES.map((s) => variantIds[s]),
          placeholders: [
            {
              position: "front",
              images: [{ id: imageId, x: 0.5, y: 0.5, scale: 1, angle: 0 }],
            },
          ],
        },
      ],
    }),
  })) as { id: string };

  console.log(`  Created "${artworkTitle}" ${typeLabel} → product ID: ${product.id}`);

  // Publish best-effort — accounts without a connected sales channel may get an error,
  // but products are still orderable via the API by ID.
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
        `${err instanceof Error ? err.message : String(err)}. ` +
        `Product is still orderable via the Printify API by ID.`
    );
  }

  return product.id;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Printify Provisioning Script ===\n");

  if (!process.env.PRINTIFY_API_KEY) {
    throw new Error("PRINTIFY_API_KEY is not set");
  }

  // Load blueprint config (reads from file or PRINTIFY_BLUEPRINT_CONFIG env var)
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
  console.log(`  Sizes: ${REQUIRED_PRINT_SIZES.join(", ")}`);

  const shopId = await getShopId();
  console.log(`\nShop ID: ${shopId}\n`);

  // Fetch artworks that are missing one or both Printify product IDs
  console.log("Fetching artworks needing Printify products...");
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
      const imageId = await uploadImage(artwork.imageUrl, artwork.slug);

      let matteProductId = artwork.printifyMatteProductId;
      if (!matteProductId) {
        matteProductId = await createProduct(
          shopId,
          config.matte.blueprintId,
          config.matte.printProviderId,
          config.matte.variantIds,
          imageId,
          artwork.title,
          "matte"
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
          config.framed.variantIds,
          imageId,
          artwork.title,
          "framed"
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
      `  ${SIZE_LABELS[size]}: Matte $${PRINT_PRICES_CENTS.matte[size] / 100}` +
        `  ·  Framed $${PRINT_PRICES_CENTS.framed[size] / 100}`
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
