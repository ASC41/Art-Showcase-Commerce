import { printifyRequest, getShopId } from "../lib/printify.js";

async function main() {
  const shopId = await getShopId();
  const PRODUCT_ID = "69cc7f39a297aa182b0ee7ae";
  const product = await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`) as any;

  console.log("=== Current print_areas (full detail):");
  for (const pa of product.print_areas ?? []) {
    console.log(`  Group (${(pa.variant_ids ?? []).length} variants, first: ${(pa.variant_ids ?? [])[0]}):`);
    for (const ph of pa.placeholders ?? []) {
      const imgs = ph.images ?? [];
      console.log(`    position: ${ph.position}  images: ${imgs.length}`);
      for (const img of imgs) {
        console.log(`      id=${img.id} name="${img.name}" scale=${img.scale} ${img.width}×${img.height}`);
      }
    }
  }

  // Show all sleeve mockup URLs
  const allImages: any[] = product.images ?? [];
  const sleeve = allImages.filter(i => i.src?.includes("sleeve"));
  console.log(`\nSleeve mockup URLs (${sleeve.length}):`);
  for (const img of sleeve) {
    const label = img.src?.match(/camera_label=([^&]+)/)?.[1];
    const vid = img.src?.match(/\/mockup\/[^/]+\/(\d+)\//)?.[1];
    const cam = img.src?.match(/\/mockup\/[^/]+\/\d+\/(\d+)\//)?.[1];
    console.log(`  label=${label} variant=${vid} camera=${cam}`);
    console.log(`  ${img.src?.slice(0,100)}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
