import { printifyRequest, getShopId } from "../lib/printify.js";

const PRODUCT_ID = "69cc7f39a297aa182b0ee7ae";
const ARTWORK_ID = "69cc4d8774da906da2c485be";
const ART_W = 691, ART_H = 1041, ART_SCALE = 0.7585290298012629;

async function main() {
  const shopId = await getShopId();
  const existing = await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`) as any;
  const allVariantIds: number[] = (existing.variants ?? []).map((v: any) => v.id);
  console.log(`Restoring with ${allVariantIds.length} variants in single group (front only)...`);

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
          variant_ids: allVariantIds,
          placeholders: [
            { position: "front", images: [{ id: ARTWORK_ID, name: "Grin and Bear It — Comfort Colors T-Shirt", type: "image/jpeg", width: ART_W, height: ART_H, x: 0.5, y: 0.5, scale: ART_SCALE, angle: 0 }] },
          ],
        },
      ],
    }),
  }) as any;

  const groups = res.print_areas ?? [];
  console.log(`Restored: ${groups.length} group(s)`);
  for (const pa of groups) {
    console.log(`  [${(pa.variant_ids ?? []).length} variants]:`);
    for (const ph of pa.placeholders ?? []) {
      console.log(`    ${ph.position}: ${(ph.images ?? []).length} image(s)`);
    }
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
