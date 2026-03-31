/**
 * Printify Provisioning Script
 *
 * Creates Enhanced Matte Paper Poster and Framed Poster products in Printify
 * for every artwork in the database, then stores the product IDs back in the DB.
 *
 * Run once (idempotent — skips artworks that already have product IDs):
 *   pnpm --filter @workspace/api-server run provision-printify
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { db, artworksTable } from "@workspace/db";
import { eq, isNull, or } from "drizzle-orm";
import {
  printifyRequest,
  getShopId,
  type PrintifyConfig,
  type PrintSize,
} from "../lib/printify";

const BLUEPRINT_NAMES = {
  matte: "Enhanced Matte Paper Poster (in)",
  framed: "Framed Poster",
} as const;

const TARGET_SIZES: Record<string, PrintSize> = {
  "8x10": "8x10",
  "11x14": "11x14",
  "18x24": "18x24",
  "24x36": "24x36",
};

const SIZE_LABELS: Record<PrintSize, string> = {
  "8x10": "8″ × 10″",
  "11x14": "11″ × 14″",
  "18x24": "18″ × 24″",
  "24x36": "24″ × 36″",
};

interface PrintifyBlueprint {
  id: number;
  title: string;
  description: string;
}

interface PrintifyProvider {
  id: number;
  title: string;
}

interface PrintifyVariant {
  id: number;
  title: string;
  options: { size?: string; [key: string]: unknown };
  placeholders: Array<{ position: string }>;
}

async function discoverBlueprints(): Promise<{
  matteId: number;
  framedId: number;
}> {
  console.log("Fetching Printify blueprint catalog...");
  const blueprints = (await printifyRequest(
    "/catalog/blueprints.json"
  )) as PrintifyBlueprint[];

  const matte = blueprints.find((b) =>
    b.title.toLowerCase().includes("enhanced matte paper poster")
  );
  const framed = blueprints.find((b) =>
    b.title.toLowerCase().includes("framed poster")
  );

  if (!matte) throw new Error(`Blueprint not found: ${BLUEPRINT_NAMES.matte}`);
  if (!framed)
    throw new Error(`Blueprint not found: ${BLUEPRINT_NAMES.framed}`);

  console.log(`  Matte blueprint: ${matte.title} (ID: ${matte.id})`);
  console.log(`  Framed blueprint: ${framed.title} (ID: ${framed.id})`);

  return { matteId: matte.id, framedId: framed.id };
}

async function pickProvider(blueprintId: number): Promise<number> {
  const providers = (await printifyRequest(
    `/catalog/blueprints/${blueprintId}/print_providers.json`
  )) as PrintifyProvider[];
  if (!providers.length)
    throw new Error(`No providers for blueprint ${blueprintId}`);
  const provider = providers[0];
  console.log(`  Provider: ${provider.title} (ID: ${provider.id})`);
  return provider.id;
}

async function discoverVariantIds(
  blueprintId: number,
  providerId: number
): Promise<Record<PrintSize, number>> {
  const variants = (await printifyRequest(
    `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`
  )) as { variants: PrintifyVariant[] };

  const variantList = variants.variants ?? (variants as unknown as PrintifyVariant[]);
  const result: Partial<Record<PrintSize, number>> = {};

  for (const v of variantList) {
    const title = v.title ?? "";
    for (const [sizeKey, printSize] of Object.entries(TARGET_SIZES)) {
      const [w, h] = sizeKey.split("x");
      const pattern = new RegExp(`${w}[^x]*x[^0-9]*${h}`, "i");
      if (pattern.test(title) || title.includes(sizeKey)) {
        if (!result[printSize]) {
          result[printSize] = v.id;
          console.log(`    Variant "${title}" → ${sizeKey} (ID: ${v.id})`);
        }
      }
    }
  }

  const missing = (Object.keys(TARGET_SIZES) as PrintSize[]).filter(
    (s) => !result[s]
  );
  if (missing.length) {
    console.warn(
      `  WARNING: Could not find variants for sizes: ${missing.join(", ")}`
    );
    console.log(
      `  Available variants: ${variantList
        .slice(0, 20)
        .map((v) => v.title)
        .join(", ")}`
    );
  }

  return result as Record<PrintSize, number>;
}

async function uploadImage(imageUrl: string, title: string): Promise<string> {
  console.log(`  Uploading image for "${title}"...`);
  const result = (await printifyRequest("/uploads/images.json", {
    method: "POST",
    body: JSON.stringify({
      file_name: `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.jpg`,
      url: imageUrl,
    }),
  })) as { id: string };
  console.log(`  Uploaded → image ID: ${result.id}`);
  return result.id;
}

async function createProduct(
  shopId: string,
  blueprintId: number,
  providerId: number,
  variantIds: Record<PrintSize, number>,
  imageId: string,
  title: string,
  printType: "matte" | "framed"
): Promise<string> {
  const printTypeLabel =
    printType === "matte" ? "Enhanced Matte Poster" : "Framed Poster";

  const variants = (Object.entries(variantIds) as [PrintSize, number][]).map(
    ([size, id]) => ({
      id,
      price: getPrintPriceCents(printType, size),
      is_enabled: true,
    })
  );

  const product = (await printifyRequest(
    `/shops/${shopId}/products.json`,
    {
      method: "POST",
      body: JSON.stringify({
        title: `${title} — ${printTypeLabel}`,
        description: `Fine art ${printTypeLabel.toLowerCase()} by Ryan Cellar. Archival quality, museum-grade materials.`,
        blueprint_id: blueprintId,
        print_provider_id: providerId,
        variants,
        print_areas: [
          {
            variant_ids: Object.values(variantIds),
            placeholders: [
              {
                position: "front",
                images: [
                  {
                    id: imageId,
                    x: 0.5,
                    y: 0.5,
                    scale: 1,
                    angle: 0,
                  },
                ],
              },
            ],
          },
        ],
      }),
    }
  )) as { id: string };

  console.log(`  Created product ID: ${product.id}`);
  return product.id;
}

function getPrintPriceCents(type: "matte" | "framed", size: PrintSize): number {
  const prices: Record<"matte" | "framed", Record<PrintSize, number>> = {
    matte: { "8x10": 3500, "11x14": 4500, "18x24": 6500, "24x36": 9500 },
    framed: { "8x10": 6500, "11x14": 8500, "18x24": 11500, "24x36": 16500 },
  };
  return prices[type][size];
}

async function publishProduct(shopId: string, productId: string): Promise<void> {
  try {
    await printifyRequest(
      `/shops/${shopId}/products/${productId}/publishing_succeeded.json`,
      {
        method: "POST",
        body: JSON.stringify({
          title: true,
          description: true,
          images: true,
          variants: true,
          tags: true,
        }),
      }
    );
  } catch {
    console.warn(`  Could not publish product ${productId} (may already be published or not needed for manual fulfillment)`);
  }
}

async function main() {
  console.log("=== Printify Provisioning Script ===\n");

  if (!process.env.PRINTIFY_API_KEY) {
    console.error("ERROR: PRINTIFY_API_KEY is not set");
    process.exit(1);
  }

  const shopId = await getShopId();
  console.log(`Shop ID: ${shopId}\n`);

  console.log("Discovering blueprints...");
  const { matteId, framedId } = await discoverBlueprints();

  console.log("\nFinding print providers...");
  console.log("  Matte:");
  const matteProviderId = await pickProvider(matteId);
  console.log("  Framed:");
  const framedProviderId = await pickProvider(framedId);

  console.log("\nDiscovering variant IDs...");
  console.log("  Matte variants:");
  const matteVariants = await discoverVariantIds(matteId, matteProviderId);
  console.log("  Framed variants:");
  const framedVariants = await discoverVariantIds(framedId, framedProviderId);

  const config: PrintifyConfig = {
    matte: {
      blueprintId: matteId,
      printProviderId: matteProviderId,
      variantIds: matteVariants,
    },
    framed: {
      blueprintId: framedId,
      printProviderId: framedProviderId,
      variantIds: framedVariants,
    },
  };

  const configPath = path.join(__dirname, "../config/printify-blueprints.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\nBlueprint config saved to: ${configPath}`);

  console.log("\nFetching artworks needing provisioning...");
  const artworks = await db
    .select()
    .from(artworksTable)
    .where(
      or(
        isNull(artworksTable.printifyMatteProductId),
        isNull(artworksTable.printifyFramedProductId)
      )
    );

  console.log(`Found ${artworks.length} artworks to provision\n`);

  for (const artwork of artworks) {
    console.log(`Processing: "${artwork.title}" (${artwork.slug})`);

    try {
      const imageId = await uploadImage(artwork.imageUrl, artwork.title);

      let matteProductId = artwork.printifyMatteProductId;
      if (!matteProductId) {
        console.log("  Creating matte poster product...");
        matteProductId = await createProduct(
          shopId,
          matteId,
          matteProviderId,
          matteVariants,
          imageId,
          artwork.title,
          "matte"
        );
        await publishProduct(shopId, matteProductId);
      } else {
        console.log(`  Matte product already exists: ${matteProductId}`);
      }

      let framedProductId = artwork.printifyFramedProductId;
      if (!framedProductId) {
        console.log("  Creating framed poster product...");
        framedProductId = await createProduct(
          shopId,
          framedId,
          framedProviderId,
          framedVariants,
          imageId,
          artwork.title,
          "framed"
        );
        await publishProduct(shopId, framedProductId);
      } else {
        console.log(`  Framed product already exists: ${framedProductId}`);
      }

      await db
        .update(artworksTable)
        .set({
          printifyMatteProductId: matteProductId,
          printifyFramedProductId: framedProductId,
        })
        .where(eq(artworksTable.id, artwork.id));

      console.log(`  Saved product IDs to database ✓\n`);
    } catch (err) {
      console.error(
        `  ERROR for "${artwork.title}":`,
        err instanceof Error ? err.message : String(err)
      );
      console.log("  Skipping — will be retried on next run\n");
    }
  }

  console.log("=== Provisioning complete ===");
  console.log("\nSummary of sizes and prices:");
  for (const [size, label] of Object.entries(SIZE_LABELS)) {
    const s = size as PrintSize;
    console.log(
      `  ${label}: Matte $${getPrintPriceCents("matte", s) / 100} · Framed $${getPrintPriceCents("framed", s) / 100}`
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
