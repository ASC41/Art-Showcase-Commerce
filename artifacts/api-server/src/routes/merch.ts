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
    variants: (p.variants as Array<{ id: number; title: string; color: string; size: string; priceCents?: number }>) ?? [],
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

    // Artwork scale on print area:
    //
    // In Printify, scale=1.0 means the artwork fills 100% of the print-area WIDTH.
    // The rendered height at scale s is: s × areaW / artRatio.
    //
    // COVER (default — used by tees, hoodies, phone cases, crewnecks):
    //   Fills every pixel with artwork, may crop edges.
    //   scale = max(1.0, artRatio / areaRatio)
    //
    // CONTAIN (bucket hat only — wide 1500×705 panel where COVER crops portrait art badly):
    //   Full artwork always visible, may have margins.
    //   scale = min(1.0, artRatio / areaRatio)
    //   For portrait art (ratio 0.664): scale=0.312 → fills panel height exactly, side margins
    //   For landscape art (ratio 1.531): scale=0.720 → fills panel height exactly, side margins
    //   For very wide art (ratio > 2.128): scale=1.0 → fills panel width, top/bottom margins
    const artW = artwork.imageWidth ?? 3000;
    const artH = artwork.imageHeight ?? 3000;
    // If the image file is stored rotated (e.g. portrait file displayed landscape via -90°),
    // derive the display-space dimensions so orientation/scale math matches the visual.
    const artRotation = artwork.imageRotation ?? 0;
    const dispW = artRotation === 90 || artRotation === -90 ? artH : artW;
    const dispH = artRotation === 90 || artRotation === -90 ? artW : artH;
    const areaW = merch.printAreaWidth ?? 3000;
    const areaH = merch.printAreaHeight ?? 3000;
    // Use display-space dimensions so rotated images pick the correct scale/orientation.
    // For a -90° portrait file displayed landscape: dispW > dispH, giving a landscape artRatio.
    const artRatio = dispW / dispH;
    const areaRatio = areaW / areaH;
    // Artwork scale on the print area.
    // phone-case uses COVER: the case is designed to be fully wrapped, so the
    //   painting fills the full 1853px height (trimming ~3.8% each side — invisible
    //   on a curved case). CONTAIN would leave a 59px white gap top and bottom.
    // All other products use CONTAIN: full artwork visible, no clipping, may have
    //   margins. This preserves each painting's full composition on tees, hoodies,
    //   crewnecks, bucket hats, and wide accessories.
    const COVER_SLUGS = new Set(["phone-case"]);
    const artworkScale = COVER_SLUGS.has(merch.slug)
      ? Math.max(1.0, artRatio / areaRatio)  // COVER: fills case edge-to-edge
      : Math.min(1.0, artRatio / areaRatio); // CONTAIN: full artwork visible

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

    if (merch.slug === "tote-bag") {
      // All-over print tote bag layout:
      //   Print area is 2175×4350 — top half = Side A (front), bottom half = Side B (back).
      //   • Side A: artwork at y=0.25 (center of front face), scale=1.0 (fills full width).
      //     Portrait art bleeds slightly into the top of Side B — acceptable artistic overflow.
      //   • Side B: black wordmark centered at y=0.75.
      //     Since AOP canvas is white regardless of strap colour, black wordmark on all variants.
      const WORDMARK_BLACK_URL =
        "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@232b3d5040a133da0e8c0c29a46a9dc28016d2f8/uploads/2026-04-12T05-31-45-372Z-upz8q5hd4.png";
      const wmUpload = await printifyRequest("/uploads/images.json", {
        method: "POST",
        body: JSON.stringify({ file_name: "wordmark-black.png", url: WORDMARK_BLACK_URL }),
      }) as { id: string; width: number; height: number };

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
                  y: 0.25,   // Center of Side A (top half of AOP template)
                  // CONTAIN with breathing room on all sides:
                  //   scale=artRatio fills Side A height exactly (2175px), but the bag's visible face
                  //   starts ~5-8% below y=0 (strap attachment area hides the very top of the template),
                  //   causing top/bottom crop on taller artworks. Scaling to 85% of the contain size
                  //   gives a consistent ~7.5% white border top & bottom (clearing the strap zone)
                  //   and proportional side margins. Works for all aspect ratios via Math.min clamp:
                  //     portrait art (artRatio<1): height-constrained, height=0.85×2175=1849px, side margins vary
                  //     landscape art (artRatio>1): width-constrained, width=0.85×2175=1849px, top/bottom margins vary
                  scale: 0.85 * Math.min(1.0, artRatio),
                  angle: artRotation,
                },
                {
                  id: wmUpload.id,
                  name: "Artist Wordmark",
                  type: "image/png",
                  width: wmUpload.width,
                  height: wmUpload.height,
                  x: 0.5,
                  y: 0.75,   // Center of Side B (bottom half of AOP template)
                  scale: 0.7, // ~70% of bag face width — clearly legible wordmark on the back
                  angle: 180, // Side B is physically flipped when bag folds → rotate 180° to appear right-side up
                },
              ],
            },
          ],
        },
      ];
    } else if (sig) {
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
            angle: artRotation,
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
    } else if (merch.slug === "cuff-beanie") {
      // Cuff beanie: front embroidery patch only (blueprint 1689, provider 217 is front-only).
      // Layout: artwork CONTAINED (fills patch height, side margins) + small wordmark badge
      // in the lower-right corner of the patch.
      //   - Dark variants (Black=116203, Navy=116211, Army=116201): white wordmark
      //   - Light variants (Ecru=116206): black wordmark
      // Note: embroidery requires slightly larger minimum size, so we use scale=0.15
      // (vs 0.10 for bucket hat DTF) to ensure the wordmark stitches cleanly.
      const WORDMARK_WHITE_URL =
        "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@475907b09a0969a684bac008d7aca675f3138ef4/uploads/2026-04-12T05-30-52-237Z-pd2wptkwr.png";
      const WORDMARK_BLACK_URL =
        "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@232b3d5040a133da0e8c0c29a46a9dc28016d2f8/uploads/2026-04-12T05-31-45-372Z-upz8q5hd4.png";

      const [wmWhite, wmBlack] = await Promise.all([
        printifyRequest("/uploads/images.json", {
          method: "POST",
          body: JSON.stringify({ file_name: "wordmark-white.png", url: WORDMARK_WHITE_URL }),
        }) as Promise<{ id: string; width: number; height: number }>,
        printifyRequest("/uploads/images.json", {
          method: "POST",
          body: JSON.stringify({ file_name: "wordmark-black.png", url: WORDMARK_BLACK_URL }),
        }) as Promise<{ id: string; width: number; height: number }>,
      ]);

      const BEANIE_DARK_VARIANT_IDS = [116203, 116211, 116201]; // Black, Navy, Army
      const BEANIE_LIGHT_VARIANT_IDS = [116206]; // Ecru

      const buildBeanieFrontPlaceholder = (wmId: string, wmW: number, wmH: number) => ({
        position: "front",
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
            angle: artRotation,
          },
          {
            id: wmId,
            name: "Artist Wordmark",
            type: "image/png",
            width: wmW,
            height: wmH,
            x: 0.88,
            y: 0.88,
            scale: 0.15,
            angle: 0,
          },
        ],
      });

      printAreas = [
        {
          variant_ids: variants.filter((v) => BEANIE_DARK_VARIANT_IDS.includes(v.id)).map((v) => v.id),
          placeholders: [buildBeanieFrontPlaceholder(wmWhite.id, wmWhite.width, wmWhite.height)],
        },
        {
          variant_ids: variants.filter((v) => BEANIE_LIGHT_VARIANT_IDS.includes(v.id)).map((v) => v.id),
          placeholders: [buildBeanieFrontPlaceholder(wmBlack.id, wmBlack.width, wmBlack.height)],
        },
      ].filter((pa) => pa.variant_ids.length > 0);
    } else if (merch.slug === "bucket-hat") {
      // Bucket hat: front-panel only (provider doesn't support back-panel printing).
      // Layout: artwork CONTAINED at full height (CONTAIN formula above), centered on the
      // front patch. A small wordmark badge sits in the lower-right corner of the patch.
      //   - Dark variants (Black, Navy): white wordmark on dark fabric
      //   - Light variants (Bone, Ecru): black wordmark on light fabric
      const WORDMARK_WHITE_URL =
        "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@475907b09a0969a684bac008d7aca675f3138ef4/uploads/2026-04-12T05-30-52-237Z-pd2wptkwr.png";
      const WORDMARK_BLACK_URL =
        "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@232b3d5040a133da0e8c0c29a46a9dc28016d2f8/uploads/2026-04-12T05-31-45-372Z-upz8q5hd4.png";

      const [wmWhite, wmBlack] = await Promise.all([
        printifyRequest("/uploads/images.json", {
          method: "POST",
          body: JSON.stringify({ file_name: "wordmark-white.png", url: WORDMARK_WHITE_URL }),
        }) as Promise<{ id: string; width: number; height: number }>,
        printifyRequest("/uploads/images.json", {
          method: "POST",
          body: JSON.stringify({ file_name: "wordmark-black.png", url: WORDMARK_BLACK_URL }),
        }) as Promise<{ id: string; width: number; height: number }>,
      ]);

      // Wordmark: small badge at bottom-right of the front panel (x=0.88, y=0.88).
      // scale=0.10 → ~150px wide on 1500px panel — visible but subordinate to artwork.
      const DARK_VARIANT_IDS = [116654, 116660]; // Black, Navy
      const LIGHT_VARIANT_IDS = [116655, 116659]; // Bone, Ecru

      const buildFrontPlaceholder = (wmId: string) => ({
        position: "front",
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
            angle: artRotation,
          },
          {
            id: wmId,
            name: "Artist Wordmark",
            type: "image/png",
            width: wmWhite.width,
            height: wmWhite.height,
            x: 0.88,
            y: 0.88,
            scale: 0.10,
            angle: 0,
          },
        ],
      });

      printAreas = [
        {
          variant_ids: variants.filter((v) => DARK_VARIANT_IDS.includes(v.id)).map((v) => v.id),
          placeholders: [buildFrontPlaceholder(wmWhite.id)],
        },
        {
          variant_ids: variants.filter((v) => LIGHT_VARIANT_IDS.includes(v.id)).map((v) => v.id),
          placeholders: [buildFrontPlaceholder(wmBlack.id)],
        },
      ].filter((pa) => pa.variant_ids.length > 0);
    } else if (merch.slug === "giclee-print") {
      // Giclée Art Print — per-variant scale with equal-border logic:
      //   Each size has a different aspect ratio, so scale is computed individually.
      //   Orientation filtering ensures portrait art only shows on portrait sizes, etc.
      //   Uses gicleeScaleFor() so all four margins are equal pixels — no flush edges.
      // Use display-space dimensions so rotated images (e.g. portrait file shown landscape)
      // pick the correct giclée variant orientation.
      const artOrient = dispH > dispW * 1.05 ? "portrait" : dispW > dispH * 1.05 ? "landscape" : "square";
      // Equal-border scale: (areaW - s*areaW)/2 = (areaH - s*areaW/artRatio)/2
      // → s = (areaW - areaH) / (areaW × (1 - 1/artRatio))
      // Caps at 90% of CONTAIN (visible border when ratios nearly match) and
      // floors at 70% of CONTAIN (artwork stays large enough for a good mockup).
      const gicleeScaleFor = (vAreaW: number, vAreaH: number) => {
        const ar = dispW / dispH;
        const containS = Math.min(ar, vAreaW / vAreaH) / Math.max(ar, vAreaW / vAreaH);
        const denom = vAreaW * (1 - 1 / ar);
        const equalBorderS = Math.abs(denom) > 0.5 ? (vAreaW - vAreaH) / denom : containS;
        return Math.max(Math.min(equalBorderS, containS * 0.90), containS * 0.70);
      };
      const enabledVariantIds: number[] = [];
      printAreas = variants.map((v) => {
        const vAreaW = v.areaW ?? (merch.printAreaWidth ?? 3300);
        const vAreaH = v.areaH ?? (merch.printAreaHeight ?? 4200);
        const vOrient = vAreaH > vAreaW * 1.05 ? "portrait" : vAreaW > vAreaH * 1.05 ? "landscape" : "square";
        const enabled = artOrient === "square" || artOrient === vOrient;
        if (enabled) enabledVariantIds.push(v.id);
        return {
          variant_ids: [v.id],
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
                  scale: gicleeScaleFor(vAreaW, vAreaH),
                  // Rotate the artwork in the Printify composer to match the display orientation.
                  // For "A Cry for Help" (portrait file, displayed landscape): angle=-90.
                  angle: artRotation,
                },
              ],
            },
          ],
        };
      });
      // Promote enabledVariantIds for use in the variants list below
      (merch as typeof merch & { _enabledVariantIds?: number[] })._enabledVariantIds = enabledVariantIds;
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
                  angle: artRotation,
                },
              ],
            },
          ],
        },
      ];
    }

    // Create the product on Printify
    const enabledVariantIds = (merch as typeof merch & { _enabledVariantIds?: number[] })._enabledVariantIds;
    const product = await printifyRequest(`/shops/${shopId}/products.json`, {
      method: "POST",
      body: JSON.stringify({
        title: `${artwork.title} — ${merch.name}`,
        blueprint_id: merch.blueprintId,
        print_provider_id: merch.printProviderId,
        variants: variants.map((v) => ({
          id: v.id,
          price: v.priceCents ?? merch.priceCents,
          is_enabled: enabledVariantIds ? enabledVariantIds.includes(v.id) : true,
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
    } else if (merch.slug === "phone-case") {
      // Phone cases: one front-facing image per phone model variant.
      // Each variant (iPhone 12, 13, 14, 15, 16 …) has its own camera ID — swapping
      // only the variant segment in the URL would produce a broken CDN link.
      // Instead we store one "front" image per variant so the frontend can jump to
      // the matching image when the user picks a different phone model.
      // Prefer camera_label=front over front-and-side; fall back if front absent.
      const variantOrder = new Map(variants.map((v, i) => [v.id, i]));
      const byVariant = new Map<number, string>();
      for (const img of product.images ?? []) {
        if (!img.src) continue;
        const label = cameraLabel(img.src);
        if (label !== "front" && label !== "front-and-side") continue;
        const vid = variantIdFromUrl(img.src);
        if (vid === null || !variantOrder.has(vid)) continue;
        // Prefer "front" over "front-and-side"
        const existing = byVariant.get(vid);
        if (!existing || cameraLabel(existing) !== "front") {
          byVariant.set(vid, img.src);
        }
      }
      // Sort in the same order as our variants list (iPhone 12 → 16 Pro Max)
      mockupImages = [...byVariant.entries()]
        .sort(([a], [b]) => (variantOrder.get(a) ?? 999) - (variantOrder.get(b) ?? 999))
        .map(([, url]) => url);
    } else if (merch.slug === "cuff-beanie") {
      // Cuff beanie: 4 colors × 1 angle (all share camera 112813) = 4 images.
      // The frontend uses per-variant filtering, so we store all 4 images in
      // our variant order (Black, Navy, Ecru, Army). Selecting a color shows its image.
      const BEANIE_VARIANT_ORDER = [116203, 116211, 116206, 116201]; // Black, Navy, Ecru, Army
      const byVariant = new Map<number, string>();
      for (const img of product.images ?? []) {
        if (!img.src) continue;
        const vid = variantIdFromUrl(img.src);
        if (vid !== null && BEANIE_VARIANT_ORDER.includes(vid)) {
          byVariant.set(vid, img.src);
        }
      }
      mockupImages = BEANIE_VARIANT_ORDER
        .filter((vid) => byVariant.has(vid))
        .map((vid) => byVariant.get(vid)!);
    } else if (merch.slug === "bucket-hat") {
      // Bucket hat: 4 colors × 4 angles = 16 images.
      // The frontend uses per-variant filtering (isPerVariant=true), so we store ALL
      // variant URLs for the desired camera angles (front + back + person only).
      // When the user picks a color, the frontend filters to show only that color's images.
      //
      // Storage order: all fronts first, then all backs, then all person shots.
      // Within each group, preserve the variant order (Black, Navy, Bone, Ecru).
      const BUCKET_HAT_VARIANT_ORDER = [116654, 116660, 116655, 116659]; // Black, Navy, Bone, Ecru
      const bucketHatCamPriority = (label: string) => {
        if (label === "front") return 0;
        if (label === "back") return 1;
        if (label.startsWith("person")) return 2;
        return 99; // skip left, right
      };

      // Build map: cameraLabel → sorted list of (variantOrder, url)
      const byLabelAndVariant = new Map<string, Array<{ order: number; url: string }>>();
      for (const img of product.images ?? []) {
        if (!img.src) continue;
        const label = cameraLabel(img.src);
        if (bucketHatCamPriority(label) === 99) continue;
        const vid = variantIdFromUrl(img.src);
        const order = vid !== null ? (BUCKET_HAT_VARIANT_ORDER.indexOf(vid) + 1 || 999) : 999;
        const arr = byLabelAndVariant.get(label) ?? [];
        arr.push({ order, url: img.src });
        byLabelAndVariant.set(label, arr);
      }

      // For each camera group, sort by variant order
      const sortedGroups = [...byLabelAndVariant.entries()]
        .sort((a, b) => bucketHatCamPriority(a[0]) - bucketHatCamPriority(b[0]));

      mockupImages = sortedGroups.flatMap(([, entries]) =>
        entries.sort((a, b) => a.order - b.order).map((e) => e.url)
      );
    } else if (merch.slug === "tote-bag") {
      // Tote bag: front (Side A = artwork) → back (Side B = wordmark) → person shots.
      // The AOP blueprint generates 6 variants × 8 camera labels = 48 images.
      // Deduplicate: prefer the Black 13" variant (103599) per angle, then pick by priority.
      const PREFERRED_TOTE_VARIANT = 103599;
      const totePriority = (label: string) => {
        if (label === "front") return 0;
        if (label === "back") return 1;
        if (label.startsWith("person")) return 2;
        return 3;
      };
      const allUrls = (product.images ?? [])
        .filter((img) => img.src)
        .map((img) => img.src);

      // Group by camera label, prefer the canonical variant
      const byLabel = new Map<string, string>();
      for (const url of allUrls) {
        const label = cameraLabel(url);
        const vid = variantIdFromUrl(url);
        if (!byLabel.has(label) || vid === PREFERRED_TOTE_VARIANT) {
          byLabel.set(label, url);
        }
      }
      mockupImages = [...byLabel.entries()]
        .sort((a, b) => totePriority(a[0]) - totePriority(b[0]))
        .map(([, url]) => url)
        .slice(0, 6);
    } else if (merch.slug === "giclee-print") {
      // Giclée prints: show exactly ONE flat front image per artwork.
      //
      // Printify generates one `front` mockup per size variant, all rendered at
      // the same camera distance — so the small 8×11 print fills less of the
      // frame than the 16×20, making the white border look proportionally wider
      // on each. Showing all 4 front images side-by-side gives the impression of
      // inconsistent borders. `context` lifestyle shots (print tiny on a wall)
      // make this worse. Solution: pick ONE representative front image.
      //
      // Preferred variants (middle tier — best compromise of detail vs. scale):
      //   Portrait: 66043 (12" × 18")
      //   Landscape: 66045 (18" × 12")
      const isLandscapeArtwork = dispW > dispH;
      const preferredVariantId = isLandscapeArtwork ? 66045 : 66043;
      const frontImages = (product.images ?? [])
        .filter((img) => img.src && cameraLabel(img.src) === "front");

      const preferred = frontImages.find(
        (img) => variantIdFromUrl(img.src) === preferredVariantId
      );
      const fallback = frontImages[0];
      const chosen = preferred ?? fallback;
      mockupImages = chosen ? [chosen.src] : [];
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
