import { readFileSync } from "fs";
import { join } from "path";
import { db, pool, artworksTable } from "@workspace/db";
import { merchProductsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { count } from "drizzle-orm";
import type { MerchVariant } from "@workspace/db/schema";

// ── Price catalogue ─────────────────────────────────────────────────────────
// Keep this in sync any time retail prices change.  Runs on every startup so
// both the dev and production databases are always up-to-date.
const PRICE_CATALOGUE: {
  slug: string;
  basePriceCents: number;
  variantOverrides?: Record<number, number>; // variant id → price cents
}[] = [
  // T-shirt: flat $40 across all sizes (was $32 base / $37 2XL)
  { slug: "tshirt", basePriceCents: 4000 },

  // Crewneck: flat $53 across all sizes (was $45 base / $51 2XL)
  { slug: "crewneck", basePriceCents: 5300 },

  // Tote bag: per-size pricing at ~30% margin (was $45/$55/$61)
  {
    slug: "tote-bag",
    basePriceCents: 1800,
    variantOverrides: {
      103599: 1800, // 13" × 13" Black
      103600: 2200, // 16" × 16" Black
      103601: 2500, // 18" × 18" Black
      103605: 1800, // 13" × 13" White
      103606: 2200, // 16" × 16" White
      103607: 2500, // 18" × 18" White
    },
  },
];

async function syncPrices(): Promise<void> {
  for (const entry of PRICE_CATALOGUE) {
    const [row] = await db
      .select()
      .from(merchProductsTable)
      .where(eq(merchProductsTable.slug, entry.slug));

    if (!row) continue;

    const currentBase = row.priceCents;
    const dbVariants = (row.variants ?? []) as MerchVariant[];

    const updatedVariants: MerchVariant[] = dbVariants.map((v) => {
      const override = entry.variantOverrides?.[v.id];
      if (override !== undefined) return { ...v, priceCents: override };
      // Remove stale per-variant override so base price applies uniformly
      const { priceCents: _removed, ...rest } = v as MerchVariant & { priceCents?: number };
      return rest as MerchVariant;
    });

    const needsUpdate =
      currentBase !== entry.basePriceCents ||
      JSON.stringify(dbVariants) !== JSON.stringify(updatedVariants);

    if (needsUpdate) {
      await db
        .update(merchProductsTable)
        .set({ priceCents: entry.basePriceCents, variants: updatedVariants })
        .where(eq(merchProductsTable.slug, entry.slug));
      console.log(
        `[autoSeed] Synced prices for "${entry.slug}": base → $${(entry.basePriceCents / 100).toFixed(2)}`,
      );
    }
  }
}

// ── Seed + startup ───────────────────────────────────────────────────────────

export async function autoSeedIfEmpty(): Promise<void> {
  try {
    const [{ value }] = await db.select({ value: count() }).from(artworksTable);

    if (value === 0) {
      console.log("[autoSeed] Database empty — running seed...");

      const sqlPath = join(__dirname, "seed.sql");
      const rawSql = readFileSync(sqlPath, "utf-8");

      // Strip pg_dump meta-commands (\restrict, \unrestrict) — not valid SQL
      const cleanedSql = rawSql
        .split("\n")
        .filter((line) => !line.startsWith("\\"))
        .join("\n");

      const client = await pool.connect();
      try {
        await client.query(cleanedSql);
        console.log("[autoSeed] Seed complete.");
      } finally {
        client.release();
      }
    } else {
      console.log(`[autoSeed] ${value} artworks already present — skipping seed.`);
    }

    // Always sync prices regardless of whether seed ran
    await syncPrices();
  } catch (err) {
    console.error(
      "[autoSeed] Failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
