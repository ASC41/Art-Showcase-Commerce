import { Router, type IRouter } from "express";
import { db, artworksTable } from "@workspace/db";
import {
  merchProductsTable,
  merchArtworkProductsTable,
} from "@workspace/db/schema";
import type { MerchVariant, SignatureConfig } from "@workspace/db/schema";
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

    // Scale-to-contain for the artwork: prevents cropping regardless of orientation.
    // Printify IGNORES width/height fields (normalises to actual file dims).
    // At scale=1.0 Printify COVERS (crops). CONTAIN = min(r,ar)/max(r,ar).
    // Using actual artwork pixel dims honours portrait/landscape/square paintings.
    const artW = artwork.imageWidth ?? 3000;
    const artH = artwork.imageHeight ?? 3000;
    const areaW = merch.printAreaWidth ?? 3000;
    const areaH = merch.printAreaHeight ?? 3000;
    const artRatio = artW / artH;
    const areaRatio = areaW / areaH;
    const artworkScale = Math.min(artRatio, areaRatio) / Math.max(artRatio, areaRatio);

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
    const sig = merch.signatureConfig as SignatureConfig | null;

    // ── Build print_areas ─────────────────────────────────────────────────────
    let printAreas: object[];

    if (sig) {
      // Color-aware signature product (e.g. hoodie):
      //   dark variants → white wordmark; light variants → black wordmark.
      // Upload both wordmarks in parallel; Printify returns actual pixel dims.
      const [whiteUpload, blackUpload] = await Promise.all([
        printifyRequest("/uploads/images.json", {
          method: "POST",
          body: JSON.stringify({ file_name: "wordmark-white.png", url: sig.whiteWordmarkUrl }),
        }) as Promise<{ id: string; width: number; height: number }>,
        printifyRequest("/uploads/images.json", {
          method: "POST",
          body: JSON.stringify({ file_name: "wordmark-black.png", url: sig.blackWordmarkUrl }),
        }) as Promise<{ id: string; width: number; height: number }>,
      ]);

      // Contain-scale each wordmark against the embroidery area using real dims.
      const containScale = (w: number, h: number, aW: number, aH: number) =>
        Math.min(w / h, aW / aH) / Math.max(w / h, aW / aH);
      const whiteWordmarkScale = containScale(
        whiteUpload.width ?? sig.areaWidth,
        whiteUpload.height ?? sig.areaHeight,
        sig.areaWidth,
        sig.areaHeight
      );
      const blackWordmarkScale = containScale(
        blackUpload.width ?? sig.areaWidth,
        blackUpload.height ?? sig.areaHeight,
        sig.areaWidth,
        sig.areaHeight
      );

      const artworkPlaceholder = {
        position: merch.printAreaPosition,
        images: [
          {
            id: imageId,
            name: `${artwork.title} — ${merch.name}`,
            type: "image/jpeg",
            width: artW,
            height: artH,
            x: 0.5,
            y: 0.5,
            scale: artworkScale,
            angle: 0,
          },
        ],
      };

      const signaturePlaceholder = (wordmarkId: string, wordmarkScale: number) => ({
        position: sig.position,
        images: [
          {
            id: wordmarkId,
            name: "Artist Signature",
            type: "image/png",
            width: sig.areaWidth,
            height: sig.areaHeight,
            x: 0.5,
            y: 0.5,
            scale: wordmarkScale,
            angle: 0,
          },
        ],
      });

      printAreas = [
        {
          variant_ids: sig.darkVariantIds,
          placeholders: [artworkPlaceholder, signaturePlaceholder(whiteUpload.id, whiteWordmarkScale)],
        },
        {
          variant_ids: sig.lightVariantIds,
          placeholders: [artworkPlaceholder, signaturePlaceholder(blackUpload.id, blackWordmarkScale)],
        },
      ];
    } else {
      printAreas = [
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
                  width: artW,
                  height: artH,
                  x: 0.5,
                  y: 0.5,
                  scale: artworkScale,
                  angle: 0,
                },
              ],
            },
          ],
        },
      ];
    }

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
        print_areas: printAreas,
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
