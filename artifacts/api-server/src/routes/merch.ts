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

    // Sort mockup images so the most informative angles come first:
    //   back (artwork) → front-collar-closeup (signature) → front → person → others
    // This ensures the lightbox carousel surfaces the artwork and chest signature
    // prominently regardless of Printify's default image ordering.
    const cameraLabel = (url: string) => url.match(/camera_label=([^&]+)/)?.[1] ?? "";
    // Priority for non-signature products (standard ordering)
    const cameraPriority = (url: string) => {
      const label = cameraLabel(url);
      if (label === "back") return 0;
      if (label.includes("collar") || label === "front-collar-closeup") return 1;
      if (label === "front") return 2;
      if (label.startsWith("person")) return 3;
      if (label === "back-2") return 4;
      return 5;
    };

    // Priority for signature products (e.g. hoodie): person shots surface before flat
    // ghost front because Printify does NOT render front_left_chest in flat ghost front
    // shots. Person/lifestyle shots (real person wearing the hoodie) DO render the
    // left-chest print, making the wordmark visible. Flat "front" is excluded entirely
    // (priority 99) so it doesn't consume a slot when better shots exist.
    const sigCameraPriority = (url: string) => {
      const label = cameraLabel(url);
      if (label === "back") return 0;
      if (label === "person-1") return 1;       // model front — wordmark visible on chest
      if (label.includes("collar") || label === "front-collar-closeup") return 2;
      if (label === "person-4-back") return 3;  // model back — artwork visible; no cuff issue
      if (label === "folded") return 4;
      if (label === "back-2") return 99;        // excluded — shows sleeve cuff print areas
      if (label.startsWith("person")) return 5; // other person shots deprioritised
      if (label === "front") return 99;         // excluded — never renders front_left_chest
      return 6;
    };

    // For signature products (e.g. hoodie), pick variant-aware images per angle:
    //   front-facing angles → dark variant (Black) so the WHITE wordmark is clearly
    //   visible on dark fabric; back angles → light variant (White) so the artwork
    //   prints on a neutral background and pops.
    // We extract the variant ID embedded in Printify's CDN URL pattern:
    //   https://images-api.printify.com/mockup/{productId}/{variantId}/{cameraId}/...
    const variantIdFromUrl = (url: string): number | null => {
      const m = url.match(/\/mockup\/[^/]+\/(\d+)\//);
      return m ? parseInt(m[1], 10) : null;
    };

    let mockupImages: string[];
    if (sig) {
      const darkIds = new Set(sig.darkVariantIds);
      const lightIds = new Set(sig.lightVariantIds);
      const isFrontAngle = (label: string) =>
        label === "front" || label.includes("collar") || label.startsWith("person");
      const isBackAngle = (label: string) =>
        label === "back" || label === "back-2" || label === "folded";

      // Group all candidate URLs by camera label
      const byLabel = new Map<string, string[]>();
      for (const img of product.images ?? []) {
        if (!img.src) continue;
        const label = cameraLabel(img.src);
        const arr = byLabel.get(label) ?? [];
        arr.push(img.src);
        byLabel.set(label, arr);
      }

      // For each label group, pick the best-variant image
      const chosen: string[] = [];
      for (const [label, urls] of byLabel) {
        const preferDark = isFrontAngle(label);
        const preferLight = isBackAngle(label);
        let best = urls[0];
        for (const url of urls) {
          const vid = variantIdFromUrl(url);
          if (vid === null) continue;
          if (preferDark && darkIds.has(vid)) { best = url; break; }
          if (preferLight && lightIds.has(vid)) { best = url; break; }
        }
        chosen.push(best);
      }

      // Keep only the 5 defined slots: back, person-1, collar, back-2, folded.
      // Priority >= 5 means extra person shots (person-2+) or unknown — excluded.
      mockupImages = chosen
        .filter((url) => sigCameraPriority(url) < 5)
        .sort((a, b) => sigCameraPriority(a) - sigCameraPriority(b))
        .slice(0, 5);
    } else {
      mockupImages = (product.images ?? [])
        .filter((img) => img.src)
        .map((img) => img.src)
        .sort((a, b) => cameraPriority(a) - cameraPriority(b))
        .slice(0, 6);
    }

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
