import { readFileSync } from "fs";
import { join } from "path";
import { db, pool, artworksTable } from "@workspace/db";
import { count } from "drizzle-orm";

export async function autoSeedIfEmpty(): Promise<void> {
  try {
    const [{ value }] = await db.select({ value: count() }).from(artworksTable);
    if (value > 0) {
      console.log(`[autoSeed] ${value} artworks already present — skipping seed.`);
      return;
    }

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
  } catch (err) {
    console.error("[autoSeed] Failed:", err instanceof Error ? err.message : String(err));
  }
}
