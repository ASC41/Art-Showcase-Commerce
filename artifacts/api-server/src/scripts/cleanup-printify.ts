/**
 * cleanup-printify.ts
 *
 * Deletes Printify products that are NOT referenced by the website database.
 *
 * Keeps:
 *   - merch_artwork_products.printify_product_id  (per-artwork merch cache)
 *   - artworks.printify_matte_product_id           (fine art print products)
 *   - artworks.printify_framed_product_id          (framed print products)
 *
 * Dry-run (default):
 *   pnpm --filter @workspace/api-server run printify:cleanup
 *
 * Live delete:
 *   pnpm --filter @workspace/api-server run printify:cleanup:confirm
 */

import { db, artworksTable } from "@workspace/db";
import { merchArtworkProductsTable } from "@workspace/db/schema";
import { printifyRequest, getShopId } from "../lib/printify";

const CONFIRM = process.argv.includes("--confirm");

interface PrintifyProduct {
  id: string;
  title: string;
}

// ── 1. Collect every Printify product ID the website actually uses ────────────
async function buildKeepSet(): Promise<Set<string>> {
  const keep = new Set<string>();

  // merch_artwork_products — one Printify product per artwork × merch type
  const mapRows = await db
    .select({ printifyProductId: merchArtworkProductsTable.printifyProductId })
    .from(merchArtworkProductsTable);

  for (const row of mapRows) {
    if (row.printifyProductId) keep.add(row.printifyProductId);
  }

  // artworks — matte + framed print products
  const artworkRows = await db
    .select({
      matte: artworksTable.printifyMatteProductId,
      framed: artworksTable.printifyFramedProductId,
    })
    .from(artworksTable);

  for (const row of artworkRows) {
    if (row.matte) keep.add(row.matte);
    if (row.framed) keep.add(row.framed);
  }

  return keep;
}

// ── 2. Fetch every product in the Printify shop (paginated) ──────────────────
async function fetchAllPrintifyProducts(shopId: string): Promise<PrintifyProduct[]> {
  const all: PrintifyProduct[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const data = (await printifyRequest(
      `/shops/${shopId}/products.json?limit=${limit}&page=${page}`
    )) as { data: PrintifyProduct[] };

    const products: PrintifyProduct[] = data.data ?? [];
    all.push(...products);

    if (products.length < limit) break;
    page++;
    process.stdout.write(`  fetched page ${page - 1} (${all.length} total so far)...\n`);
  }

  return all;
}

// ── 3. Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Printify Cleanup ===");
  console.log(CONFIRM ? "MODE: LIVE DELETE\n" : "MODE: DRY RUN (pass --confirm to delete)\n");

  console.log("Building keep-list from database...");
  const keepSet = await buildKeepSet();
  console.log(`  ${keepSet.size} product IDs are actively used by the website.\n`);

  console.log("Fetching all products from Printify...");
  const shopId = await getShopId();
  const allProducts = await fetchAllPrintifyProducts(shopId);
  console.log(`  ${allProducts.length} total products found in Printify.\n`);

  const toDelete = allProducts.filter((p) => !keepSet.has(p.id));
  const toKeep   = allProducts.filter((p) =>  keepSet.has(p.id));

  console.log(`Products to KEEP: ${toKeep.length}`);
  console.log(`Products to DELETE: ${toDelete.length}\n`);

  if (toDelete.length === 0) {
    console.log("Nothing to delete — Printify is already clean.");
    process.exit(0);
  }

  console.log("--- Products that will be deleted ---");
  for (const p of toDelete) {
    console.log(`  [${p.id}] ${p.title}`);
  }
  console.log("");

  if (!CONFIRM) {
    console.log("Dry run complete. Run with --confirm to actually delete these products.");
    process.exit(0);
  }

  // ── Live delete ──────────────────────────────────────────────────────────
  console.log("Deleting...");
  let deleted = 0;
  let failed  = 0;

  for (const p of toDelete) {
    try {
      await printifyRequest(`/shops/${shopId}/products/${p.id}.json`, {
        method: "DELETE",
      });
      console.log(`  ✓ Deleted [${p.id}] ${p.title}`);
      deleted++;
    } catch (err) {
      console.error(`  ✗ Failed  [${p.id}] ${p.title}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n=== Done: ${deleted} deleted, ${failed} failed, ${toKeep.length} kept ===`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
