import { Router, type IRouter } from "express";
import { db, artworksTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

const router: IRouter = Router();

function mapArtwork(a: typeof artworksTable.$inferSelect) {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    medium: a.medium ?? null,
    dimensions: a.dimensions ?? null,
    price: a.price ?? null,
    status: a.status as "available" | "sold" | "unavailable",
    description: a.description ?? null,
    imageUrl: a.imageUrl,
    isFeatured: a.isFeatured,
    year: a.year ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

// List all artworks — featured first, then by id
router.get("/artworks", async (_req, res) => {
  try {
    const artworks = await db
      .select()
      .from(artworksTable)
      .orderBy(asc(artworksTable.id));

    const sorted = [...artworks].sort((a, b) => {
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      return a.id - b.id;
    });

    res.json(sorted.map(mapArtwork));
  } catch (err) {
    console.error("listArtworks error:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get artwork by slug
router.get("/artworks/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const [artwork] = await db
      .select()
      .from(artworksTable)
      .where(eq(artworksTable.slug, slug))
      .limit(1);

    if (!artwork) {
      res.status(404).json({ error: "Artwork not found" });
      return;
    }

    res.json(mapArtwork(artwork));
  } catch (err) {
    console.error("getArtwork error:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
