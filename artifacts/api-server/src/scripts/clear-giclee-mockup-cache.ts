/**
 * clear-giclee-mockup-cache.ts
 *
 * One-off cleanup script: deletes all cached mockup rows for the giclee-print
 * product so they regenerate using the corrected single-front-image logic
 * added in the giclée carousel fix.
 *
 * Background: Before the fix, the route cached up to 6 images per artwork
 * (4 × front variants at different sizes + 2 × context/lifestyle shots).
 * Different sizes are rendered at the same camera distance by Printify, so
 * the white border appears proportionally wider on small prints → inconsistent
 * appearance across carousel slides.  After the fix, only ONE front image
 * (preferred: 12×18 for portrait, 18×12 for landscape) is stored per artwork.
 *
 * The route returns cached rows early, so existing rows must be deleted to
 * trigger fresh generation with the new logic.
 *
 * Run: pnpm --filter @workspace/api-server exec tsx src/scripts/clear-giclee-mockup-cache.ts
 */

import { db, merchProductsTable, merchArtworkProductsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const [giclee] = await db
    .select({ id: merchProductsTable.id })
    .from(merchProductsTable)
    .where(eq(merchProductsTable.slug, "giclee-print"))
    .limit(1);

  if (!giclee) {
    console.log("giclee-print product not found — nothing to clear.");
    return;
  }

  const deleted = await db
    .delete(merchArtworkProductsTable)
    .where(eq(merchArtworkProductsTable.merchProductId, giclee.id))
    .returning({ id: merchArtworkProductsTable.id });

  console.log(`Deleted ${deleted.length} stale giclée mockup cache row(s).`);
  console.log("Rows will regenerate with the single-front-image logic on next request.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
