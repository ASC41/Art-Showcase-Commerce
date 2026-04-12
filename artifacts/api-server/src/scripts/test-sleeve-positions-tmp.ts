import { printifyRequest, getShopId } from "../lib/printify.js";

const PRODUCT_ID = "69cc7f39a297aa182b0ee7ae";
const WHITE_VARIANT_IDS = [73199, 73203, 73207, 73211, 73215];
const ARTWORK_ID = "69cc4d8774da906da2c485be";
const ART_W = 691, ART_H = 1041, ART_SCALE = 0.7585290298012629;

async function main() {
  const shopId = await getShopId();
  const existing = await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`) as any;
  const allVariantIds: number[] = (existing.variants ?? []).map((v: any) => v.id);
  const whiteSet = new Set(WHITE_VARIANT_IDS);
  const darkVarIds = allVariantIds.filter(id => !whiteSet.has(id));

  // Upload a small wordmark image to use
  const wm = await printifyRequest("/uploads/images.json", {
    method: "POST",
    body: JSON.stringify({ file_name: "wordmark-white.png", url: "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@475907b09a0969a684bac008d7aca675f3138ef4/uploads/2026-04-12T05-30-52-237Z-pd2wptkwr.png" }),
  }) as any;
  console.log(`Wordmark uploaded: ${wm.id}`);

  const frontPlaceholder = {
    position: "front",
    images: [{ id: ARTWORK_ID, name: "Artwork", type: "image/jpeg", width: ART_W, height: ART_H, x: 0.5, y: 0.5, scale: ART_SCALE, angle: 0 }],
  };
  const wm_img = { id: wm.id, name: "Wordmark", type: "image/png", width: wm.width, height: wm.height, x: 0.5, y: 0.5, scale: 0.6667, angle: 0 };

  // Test various sleeve position names
  const positionsToTest = ["left_sleeve", "right_sleeve", "sleeve_left", "left_arm", "left_sleeve_dtf", "left_wrist_dtf"];
  
  for (const pos of positionsToTest) {
    try {
      const res = await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`, {
        method: "PUT",
        body: JSON.stringify({
          title: existing.title,
          description: existing.description,
          blueprint_id: existing.blueprint_id,
          print_provider_id: existing.print_provider_id,
          variants: (existing.variants ?? []).map((v: any) => ({ id: v.id, price: v.price ?? 3200, is_enabled: v.is_enabled })),
          print_areas: [
            {
              variant_ids: WHITE_VARIANT_IDS,
              placeholders: [frontPlaceholder, { position: pos, images: [wm_img] }],
            },
            {
              variant_ids: darkVarIds,
              placeholders: [frontPlaceholder, { position: pos, images: [wm_img] }],
            },
          ],
        }),
      }) as any;
      
      // Check if position was retained in response
      const positions = new Set<string>();
      for (const pa of res.print_areas ?? []) {
        for (const ph of pa.placeholders ?? []) positions.add(ph.position);
      }
      const retained = positions.has(pos) ? "RETAINED" : "silently dropped";
      console.log(`  ${pos}: ACCEPTED by API, ${retained} (positions: ${[...positions].join(",")})`);
    } catch(e: any) {
      console.log(`  ${pos}: ERROR — ${e?.message?.slice(0,80) ?? e}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
