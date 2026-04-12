import { printifyRequest, getShopId } from "../lib/printify.js";

async function main() {
  const shopId = await getShopId();
  const product = await printifyRequest(`/shops/${shopId}/products/69db36a8cca0c3b3780bb3a2.json`) as any;

  console.log("=== Print Areas on template product:");
  for (const pa of product.print_areas ?? []) {
    const vids = (pa.variant_ids ?? []).slice(0, 3).join(",") + "...";
    console.log(`  variants: ${vids}`);
    for (const ph of pa.placeholders ?? []) {
      console.log(`    position: ${ph.position}  images: ${(ph.images ?? []).length}`);
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
