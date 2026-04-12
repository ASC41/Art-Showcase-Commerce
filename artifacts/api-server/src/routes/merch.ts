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

    // Artwork scale on print area — COVER formula:
    //
    // In Printify, scale=1.0 means the artwork fills 100% of the print-area WIDTH.
    // The rendered height at scale s is: s × areaW / artRatio.
    // For COVER (no white borders on any axis) we need rendered height ≥ areaH:
    //   s × areaW / artRatio ≥ areaH  →  s ≥ artRatio / areaRatio
    // Combined with the minimum of 1.0 (full width fill), the COVER scale is:
    //   scale = max(1.0, artRatio / areaRatio)
    //
    // Examples:
    //   Phone case (areaRatio=0.622), portrait art (artRatio=0.831):
    //     scale = max(1.0, 0.831/0.622) = 1.336 → fills height, crops width slightly
    //   Hoodie (areaRatio=0.876), portrait art (artRatio=0.664):
    //     scale = max(1.0, 0.664/0.876) = 1.0 → fills width, artwork taller than area → COVER
    //   Bucket hat (areaRatio=2.128), any portrait art:
    //     scale = max(1.0, 0.8/2.128) = 1.0 → artwork fills width, narrower than area → CONTAIN
    //     (bucket hat is a wide panel; portrait art doesn't fill it fully, which is intentional)
    const artW = artwork.imageWidth ?? 3000;
    const artH = artwork.imageHeight ?? 3000;
    const areaW = merch.printAreaWidth ?? 3000;
    const areaH = merch.printAreaHeight ?? 3000;
    const artRatio = artW / artH;
    const areaRatio = areaW / areaH;
    const artworkScale = Math.max(1.0, artRatio / areaRatio);

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

      // Build one placeholder object per sig position (supports multi-area wordmarks)
      const sigPositions = sig.signaturePositions ?? [sig.position];
      const signaturePlaceholders = (wordmarkId: string, wordmarkScale: number, uploadW: number, uploadH: number) =>
        sigPositions.map((pos) => ({
          position: pos,
          images: [
            {
              id: wordmarkId,
              name: "Artist Wordmark",
              type: "image/png",
              width: uploadW,
              height: uploadH,
              x: sig.signatureX ?? 0.5,
              y: sig.signatureY ?? 0.5,
              scale: sig.signatureScale ?? wordmarkScale,
              angle: 0,
            },
          ],
        }));

      printAreas = [
        {
          variant_ids: sig.darkVariantIds,
          placeholders: [
            artworkPlaceholder,
            ...signaturePlaceholders(whiteUpload.id, whiteWordmarkScale, whiteUpload.width, whiteUpload.height),
          ],
        },
        {
          variant_ids: sig.lightVariantIds,
          placeholders: [
            artworkPlaceholder,
            ...signaturePlaceholders(blackUpload.id, blackWordmarkScale, blackUpload.width, blackUpload.height),
          ],
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

    // Priority for signature products — three modes keyed off sig.position:
    //
    // Hoodie ("front_left_chest"): artwork on back, wordmark on chest.
    //   0=back(artwork), 1=person-1(model+wordmark), 2=collar-closeup, 3=person-4-back,
    //   4=folded. Flat "front" excluded (Printify never renders front_left_chest there).
    //
    // T-shirt ("back"): artwork on front, wordmark on back.
    //   0=front(artwork), 1=back(wordmark), 2=person-1-front, 3=person-1-back, 4=folded.
    //   Sleeve/size-chart shots excluded.
    //
    // Crewneck ("left_sleeve"): artwork on front, wordmark on both sleeves.
    //   0=front(artwork), 1=person-5-left-sleeve, 2=person-5-right-sleeve,
    //   3=person-1, 4=folded. Back/lifestyle/size-chart shots excluded.
    const sigIsBackPos = sig?.position === "back" || sig?.position === "back-2";
    const sigIsWristPos = Boolean(sig?.position?.includes("wrist") || sig?.position?.includes("sleeve"));
    const sigCameraPriority = (url: string) => {
      const label = cameraLabel(url);
      if (sigIsWristPos) {
        // Crewneck: artwork front, wordmark on sleeves
        if (label === "front") return 0;
        if (label === "person-5-left-sleeve") return 1;
        if (label === "person-5-right-sleeve") return 2;
        if (label === "person-1" || label === "person-2") return 3;
        if (label === "folded") return 4;
        if (label === "size-chart" || label === "lifestyle") return 99;
        if (label.startsWith("person")) return 5;
        return 6;
      }
      if (sigIsBackPos) {
        // T-shirt: artwork front, wordmark back
        if (label === "front") return 0;
        if (label === "back") return 1;
        if (label === "person-1-front" || label === "person-2") return 2;
        if (label === "person-1-back") return 3;
        if (label === "folded") return 4;
        if (label.includes("sleeve")) return 99;
        if (label === "size-chart") return 99;
        if (label.includes("context")) return 6;
        if (label.startsWith("person")) return 5;
        return 6;
      }
      // Hoodie: artwork back, wordmark front_left_chest
      if (label === "back") return 0;
      if (label === "person-1") return 1;
      if (label.includes("collar") || label === "front-collar-closeup") return 2;
      if (label === "person-4-back") return 3;
      if (label === "folded") return 4;
      if (label === "back-2") return 99;
      if (label.startsWith("person")) return 5;
      if (label === "front") return 99;
      return 6;
    };

    // For signature products, pick variant-aware images per angle.
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

      // Variant preference per angle type:
      //
      // sig on FRONT (e.g. hoodie front_left_chest):
      //   front/person angles → dark (white wordmark visible on dark fabric)
      //   back/folded angles  → light (artwork on neutral background)
      //
      // sig on BACK (e.g. t-shirt back) or WRISTS (e.g. crewneck wrists):
      //   front/back/sleeve/person → dark (white wordmark on dark fabric)
      //   folded only              → light (clean product shot)
      const preferDarkLabel = (label: string) => {
        if (sigIsBackPos || sigIsWristPos) {
          // Everything except folded: show white wordmark on dark fabric
          return label !== "folded";
        }
        // Hoodie: front/person shots prefer dark
        return label === "front" || label.includes("collar") || label.startsWith("person");
      };
      const preferLightLabel = (label: string) => {
        if (sigIsBackPos || sigIsWristPos) {
          return label === "folded";
        }
        // Hoodie: back/folded prefer light
        return label === "back" || label === "back-2" || label === "folded";
      };

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
        const wantDark = preferDarkLabel(label);
        const wantLight = preferLightLabel(label);
        let best = urls[0];
        for (const url of urls) {
          const vid = variantIdFromUrl(url);
          if (vid === null) continue;
          if (wantDark && darkIds.has(vid)) { best = url; break; }
          if (wantLight && lightIds.has(vid)) { best = url; break; }
        }
        chosen.push(best);
      }

      // Keep only the 5 priority slots; everything else is excluded or deprioritised.
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
