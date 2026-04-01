import { Router, type IRouter } from "express";
import { db, artworksTable } from "@workspace/db";
import {
  merchProductsTable,
  merchArtworkProductsTable,
} from "@workspace/db/schema";
import type { MerchVariant } from "@workspace/db/schema";
import { asc, and, eq } from "drizzle-orm";
import { printifyRequest, getShopId } from "../lib/printify";

const router: IRouter = Router();

function mapMerchProduct(p: typeof merchProductsTable.$inferSelect) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description ?? null,
    priceCents: p.priceCents,
    blueprintId: p.blueprintId,
    printProviderId: p.printProviderId,
    printAreaPosition: p.printAreaPosition,
    printAreaWidth: p.printAreaWidth ?? null,
    printAreaHeight: p.printAreaHeight ?? null,
    printifyProductId: p.printifyProductId ?? null,
    mockupImages: p.mockupImages ?? [],
    variants: (p.variants as Array<{ id: number; title: string; color: string; size: string }>) ?? [],
    category: p.category,
    displayOrder: p.displayOrder,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

// Compute scale so artwork fits the print area without cropping
function computeScale(artW: number, artH: number, areaW: number, areaH: number): number {
  const artRatio = artW / artH;
  const areaRatio = areaW / areaH;
  const scale = artRatio > areaRatio ? areaW / artW : areaH / artH;
  return Math.min(Math.max(scale, 0.5), 1.0);
}

// GET /api/merch — list all active merch products
router.get("/merch", async (_req, res) => {
  try {
    const products = await db
      .select()
      .from(merchProductsTable)
      .where(eq(merchProductsTable.isActive, true))
      .orderBy(asc(merchProductsTable.displayOrder));

    res.json(products.map(mapMerchProduct));
  } catch (err) {
    console.error("listMerch error:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/merch/:slug — get single merch product
router.get("/merch/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const [product] = await db
      .select()
      .from(merchProductsTable)
      .where(eq(merchProductsTable.slug, slug))
      .limit(1);

    if (!product || !product.isActive) {
      res.status(404).json({ error: "Merch product not found" });
      return;
    }

    res.json(mapMerchProduct(product));
  } catch (err) {
    console.error("getMerch error:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/merch/:slug/artwork/:artworkSlug/mockups
// Returns Printify-generated mockup images for a specific artwork × merch combo.
// On first call: creates the Printify product (5-10s), caches mockup URLs.
// Subsequent calls: returns from DB cache instantly.
router.get("/merch/:slug/artwork/:artworkSlug/mockups", async (req, res) => {
  try {
    const { slug, artworkSlug } = req.params;

    // Look up merch product
    const [merch] = await db
      .select()
      .from(merchProductsTable)
      .where(and(eq(merchProductsTable.slug, slug), eq(merchProductsTable.isActive, true)))
      .limit(1);

    if (!merch) {
      res.status(404).json({ error: "Merch product not found" });
      return;
    }

    // Look up artwork
    const [artwork] = await db
      .select()
      .from(artworksTable)
      .where(eq(artworksTable.slug, artworkSlug))
      .limit(1);

    if (!artwork) {
      res.status(404).json({ error: "Artwork not found" });
      return;
    }

    // Check DB cache
    const [cached] = await db
      .select()
      .from(merchArtworkProductsTable)
      .where(
        and(
          eq(merchArtworkProductsTable.merchProductId, merch.id),
          eq(merchArtworkProductsTable.artworkId, artwork.id)
        )
      )
      .limit(1);

    if (cached?.mockupImages && cached.mockupImages.length > 0) {
      res.json({ mockupImages: cached.mockupImages, cached: true });
      return;
    }

    // Not cached — create Printify product for this artwork × merch combo
    const apiKey = process.env.PRINTIFY_API_KEY;
    if (!apiKey) {
      // Return template mockups as fallback if Printify not configured
      res.json({ mockupImages: merch.mockupImages ?? [], cached: false });
      return;
    }

    const shopId = await getShopId();

    const artW = artwork.imageWidth ?? 2000;
    const artH = artwork.imageHeight ?? 2000;
    const areaW = merch.printAreaWidth ?? 3000;
    const areaH = merch.printAreaHeight ?? 3000;
    const scale = computeScale(artW, artH, areaW, areaH);

    // Upload artwork image to Printify
    const uploadRes = await printifyRequest("/uploads/images.json", {
      method: "POST",
      body: JSON.stringify({
        file_name: `${artwork.slug}.jpg`,
        url: artwork.imageUrl,
      }),
    }) as { id: string };

    const imageId = uploadRes.id;
    const variants = (merch.variants ?? []) as MerchVariant[];

    // Create the product on Printify
    const product = await printifyRequest(`/shops/${shopId}/products.json`, {
      method: "POST",
      body: JSON.stringify({
        title: `${artwork.title} — ${merch.name}`,
        blueprint_id: merch.blueprintId,
        print_provider_id: merch.printProviderId,
        variants: variants.map((v) => ({
          id: v.id,
          price: merch.priceCents,
          is_enabled: true,
        })),
        print_areas: [
          {
            variant_ids: variants.map((v) => v.id),
            placeholders: [
              {
                position: merch.printAreaPosition,
                images: [
                  {
                    id: imageId,
                    name: `${artwork.title} — ${merch.name}`,
                    type: "image/jpeg",
                    height: artwork.imageHeight ?? 3000,
                    width: artwork.imageWidth ?? 3000,
                    x: 0.5,
                    y: 0.5,
                    scale: 1.0,
                    angle: 0,
                  },
                ],
              },
            ],
          },
        ],
      }),
    }) as { id: string; images: Array<{ src: string; is_default?: boolean }> };

    const mockupImages = (product.images ?? [])
      .filter((img) => img.src)
      .map((img) => img.src)
      .slice(0, 6);

    // Upsert into cache
    if (cached) {
      await db
        .update(merchArtworkProductsTable)
        .set({ printifyProductId: product.id, mockupImages })
        .where(eq(merchArtworkProductsTable.id, cached.id));
    } else {
      await db.insert(merchArtworkProductsTable).values({
        merchProductId: merch.id,
        artworkId: artwork.id,
        printifyProductId: product.id,
        mockupImages,
      });
    }

    res.json({ mockupImages, cached: false });
  } catch (err) {
    console.error(
      "getMerchArtworkMockups error:",
      err instanceof Error ? err.message : String(err)
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
