/**
 * Printify Provisioning Script
 *
 * Creates Enhanced Matte Paper Poster and Framed Poster products in Printify
 * for every artwork in the database, then stores the product IDs back in the DB.
 *
 * Products are intentionally NOT published to a sales channel.
 * We fulfil orders via the Printify REST API (not Shopify/Etsy/etc.), which means:
 *   - Products are created and stored in Printify's system by ID.
 *   - Orders are created by POSTing to /orders.json with explicit product_id + variant_id.
 *   - Products do not need to be "published" to a channel to be orderable this way.
 *   - The Printify publish endpoint (/products/{id}/publish.json) is intended for
 *     OAuth integration partners linking to a connected storefront — it is not used
 *     in a direct API-key workflow and would 422/404 without a connected sales channel.
 *
 * Run once (idempotent — skips artworks that already have product IDs):
 *   pnpm --filter @workspace/api-server run provision-printify
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { db, artworksTable } from "@workspace/db";
import { eq, or, isNull } from "drizzle-orm";
import {
  printifyRequest,
  getShopId,
  REQUIRED_PRINT_SIZES,
  PRINT_SIZE_INCHES,
  type PrintifyConfig,
  type PrintSize,
} from "../lib/printify";

const BLUEPRINT_SEARCH = {
  matte: "enhanced matte paper poster",
  framed: "framed poster",
} as const;

const PRINT_TYPE_LABELS = {
  matte: "Enhanced Matte Paper Poster",
  framed: "Framed Poster",
} as const;

const SIZE_LABELS: Record<PrintSize, string> = {
  "8x10":  '8" × 10"',
  "11x14": '11" × 14"',
  "18x24": '18" × 24"',
  "24x36": '24" × 36"',
};

const PRINT_PRICES_CENTS: Record<"matte" | "framed", Record<PrintSize, number>> = {
  matte:  { "8x10": 3500, "11x14": 4500, "18x24": 6500, "24x36": 9500 },
  framed: { "8x10": 6500, "11x14": 8500, "18x24": 11500, "24x36": 16500 },
};

interface PrintifyBlueprint {
  id: number;
  title: string;
}

interface PrintifyProvider {
  id: number;
  title: string;
}

interface PrintifyVariant {
  id: number;
  title: string;
}

// ── Blueprint discovery ────────────────────────────────────────────────────────
async function discoverBlueprints(): Promise<{ matteId: number; framedId: number }> {
  console.log("Fetching Printify blueprint catalog...");
  const blueprints = (await printifyRequest("/catalog/blueprints.json")) as PrintifyBlueprint[];

  const matte = blueprints.find((b) =>
    b.title.toLowerCase().includes(BLUEPRINT_SEARCH.matte)
  );
  const framed = blueprints.find((b) =>
    b.title.toLowerCase().includes(BLUEPRINT_SEARCH.framed)
  );

  if (!matte) throw new Error(`Blueprint not found matching "${BLUEPRINT_SEARCH.matte}"`);
  if (!framed) throw new Error(`Blueprint not found matching "${BLUEPRINT_SEARCH.framed}"`);

  console.log(`  Matte: "${matte.title}" (ID: ${matte.id})`);
  console.log(`  Framed: "${framed.title}" (ID: ${framed.id})`);

  return { matteId: matte.id, framedId: framed.id };
}

// ── Provider selection ────────────────────────────────────────────────────────
async function pickProvider(blueprintId: number): Promise<number> {
  const providers = (await printifyRequest(
    `/catalog/blueprints/${blueprintId}/print_providers.json`
  )) as PrintifyProvider[];
  if (!providers.length) throw new Error(`No providers for blueprint ${blueprintId}`);
  console.log(`    Provider: "${providers[0].title}" (ID: ${providers[0].id})`);
  return providers[0].id;
}

// ── Variant discovery — strict: throws if any required size is missing ─────────
async function discoverVariantIds(
  blueprintId: number,
  providerId: number,
  printType: "matte" | "framed"
): Promise<Record<PrintSize, number>> {
  const raw = (await printifyRequest(
    `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`
  )) as { variants?: PrintifyVariant[] } | PrintifyVariant[];

  const variantList: PrintifyVariant[] = Array.isArray(raw) ? raw : (raw.variants ?? []);
  const result: Partial<Record<PrintSize, number>> = {};

  for (const v of variantList) {
    const title = (v.title ?? "").toLowerCase();
    for (const size of REQUIRED_PRINT_SIZES) {
      if (result[size]) continue; // already matched
      const { w, h } = PRINT_SIZE_INCHES[size];
      // Match patterns like "8x10", "8 x 10", "8 by 10", "8in x 10in", etc.
      const patterns = [
        `${w}x${h}`,
        `${w} x ${h}`,
        `${w}" x ${h}"`,
        `${w}in x ${h}in`,
        `${w} by ${h}`,
      ];
      if (patterns.some((p) => title.includes(p))) {
        result[size] = v.id;
        console.log(`    ${size}: matched "${v.title}" → variant ID ${v.id}`);
      }
    }
  }

  const missing = REQUIRED_PRINT_SIZES.filter((s) => !result[s]);
  if (missing.length > 0) {
    const available = variantList.slice(0, 30).map((v) => `"${v.title}"`).join(", ");
    throw new Error(
      `Cannot map all required sizes for ${PRINT_TYPE_LABELS[printType]}. ` +
        `Missing: [${missing.join(", ")}].\n` +
        `Available variants (first 30): ${available}`
    );
  }

  return result as Record<PrintSize, number>;
}

// ── Image upload ───────────────────────────────────────────────────────────────
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
        `Archival quality, museum-grade materials. Available in four sizes.`,
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
  return product.id;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Printify Provisioning Script ===\n");

  if (!process.env.PRINTIFY_API_KEY) {
    throw new Error("PRINTIFY_API_KEY is not set");
  }

  const shopId = await getShopId();
  console.log(`Shop ID: ${shopId}\n`);

  // 1. Discover blueprints
  const { matteId, framedId } = await discoverBlueprints();

  // 2. Pick providers
  console.log("\nSelecting print providers...");
  console.log("  For Matte:");
  const matteProviderId = await pickProvider(matteId);
  console.log("  For Framed:");
  const framedProviderId = await pickProvider(framedId);

  // 3. Discover variants — STRICT: throws if any required size is missing
  console.log("\nDiscovering size→variant mappings...");
  console.log("  Matte variants:");
  const matteVariants = await discoverVariantIds(matteId, matteProviderId, "matte");
  console.log("  Framed variants:");
  const framedVariants = await discoverVariantIds(framedId, framedProviderId, "framed");

  // 4. Write blueprint config file
  const blueprintConfig: PrintifyConfig = {
    matte: { blueprintId: matteId, printProviderId: matteProviderId, variantIds: matteVariants },
    framed: { blueprintId: framedId, printProviderId: framedProviderId, variantIds: framedVariants },
  };

  const configPath = path.resolve(process.cwd(), "src/config/printify-blueprints.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(blueprintConfig, null, 2));
  console.log(`\nBlueprint config written to: ${configPath}`);

  // 5. Provision per-artwork products
  console.log("\nFetching artworks needing Printify products...");
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
          shopId, matteId, matteProviderId, matteVariants, imageId, artwork.title, "matte"
        );
      } else {
        console.log(`  Matte product already exists (${matteProductId}), skipping.`);
      }

      let framedProductId = artwork.printifyFramedProductId;
      if (!framedProductId) {
        framedProductId = await createProduct(
          shopId, framedId, framedProviderId, framedVariants, imageId, artwork.title, "framed"
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

  // 6. Summary
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
