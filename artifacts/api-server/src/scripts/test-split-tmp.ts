import { printifyRequest, getShopId } from "../lib/printify.js";

const PRODUCT_ID = "69cc7f39a297aa182b0ee7ae";
const BLACK_VARIANTS = [73196, 73200, 73204, 73208, 73212];
const WHITE_VARIANTS = [73199, 73203, 73207, 73211, 73215];

async function main() {
  const shopId = await getShopId();
  const existing = await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`) as any;

  let artworkImageId = "";
  let artW = 0, artH = 0, artScale = 1;
  for (const pa of existing.print_areas ?? []) {
    for (const ph of pa.placeholders ?? []) {
      if (ph.position === "front" && (ph.images ?? []).length > 0) {
        artworkImageId = ph.images[0].id;
        artW = ph.images[0].width;
        artH = ph.images[0].height;
        artScale = ph.images[0].scale;
      }
    }
  }
  console.log("Artwork ID:", artworkImageId);

  // Test 1: Just split into 2 groups with front only (no sleeve)
  console.log("\nTest 1: Split into 2 groups (front only)...");
  try {
    const r1 = await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`, {
      method: "PUT",
      body: JSON.stringify({
        title: existing.title,
        description: existing.description,
        blueprint_id: existing.blueprint_id,
        print_provider_id: existing.print_provider_id,
        variants: [...BLACK_VARIANTS, ...WHITE_VARIANTS].map(id => ({ id, price: 3200, is_enabled: true })),
        print_areas: [
          {
            variant_ids: BLACK_VARIANTS,
            placeholders: [{ position: "front", images: [{ id: artworkImageId, name: "Grin and Bear It — Comfort Colors T-Shirt", type: "image/jpeg", width: artW, height: artH, x: 0.5, y: 0.5, scale: artScale, angle: 0 }] }],
          },
          {
            variant_ids: WHITE_VARIANTS,
            placeholders: [{ position: "front", images: [{ id: artworkImageId, name: "Grin and Bear It — Comfort Colors T-Shirt", type: "image/jpeg", width: artW, height: artH, x: 0.5, y: 0.5, scale: artScale, angle: 0 }] }],
          },
        ],
      }),
    }) as any;
    console.log("Test 1 SUCCESS. Print areas:", (r1.print_areas ?? []).length);
    
    // Test 2: Now try adding left_sleeve
    console.log("\nTest 2: Add left_sleeve position...");
    const wm = await printifyRequest("/uploads/images.json", {
      method: "POST",
      body: JSON.stringify({ file_name: "wordmark-white.png", url: "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@475907b09a0969a684bac008d7aca675f3138ef4/uploads/2026-04-12T05-30-52-237Z-pd2wptkwr.png" }),
    }) as any;
    console.log("Wordmark uploaded:", wm.id, `${wm.width}×${wm.height}`);

    const r2 = await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`, {
      method: "PUT",
      body: JSON.stringify({
        title: existing.title,
        description: existing.description,
        blueprint_id: existing.blueprint_id,
        print_provider_id: existing.print_provider_id,
        variants: [...BLACK_VARIANTS, ...WHITE_VARIANTS].map(id => ({ id, price: 3200, is_enabled: true })),
        print_areas: [
          {
            variant_ids: BLACK_VARIANTS,
            placeholders: [
              { position: "front", images: [{ id: artworkImageId, name: "Artwork", type: "image/jpeg", width: artW, height: artH, x: 0.5, y: 0.5, scale: artScale, angle: 0 }] },
              { position: "left_sleeve", images: [{ id: wm.id, name: "Wordmark", type: "image/png", width: wm.width, height: wm.height, x: 0.5, y: 0.5, scale: 0.6667, angle: 0 }] },
            ],
          },
          {
            variant_ids: WHITE_VARIANTS,
            placeholders: [
              { position: "front", images: [{ id: artworkImageId, name: "Artwork", type: "image/jpeg", width: artW, height: artH, x: 0.5, y: 0.5, scale: artScale, angle: 0 }] },
              { position: "left_sleeve", images: [{ id: wm.id, name: "Wordmark", type: "image/png", width: wm.width, height: wm.height, x: 0.5, y: 0.5, scale: 0.6667, angle: 0 }] },
            ],
          },
        ],
      }),
    }) as any;
    console.log("Test 2 SUCCESS. Print areas:", (r2.print_areas ?? []).length);
    for (const pa of r2.print_areas ?? []) {
      for (const ph of pa.placeholders ?? []) {
        console.log(`  [${(pa.variant_ids ?? []).slice(0,1)}...] ${ph.position}: ${(ph.images??[]).length} images`);
      }
    }
  } catch(e: any) {
    console.log("FAILED:", e?.message ?? e);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
