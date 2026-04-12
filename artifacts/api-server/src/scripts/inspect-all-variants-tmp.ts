import { printifyRequest, getShopId } from "../lib/printify.js";

async function main() {
  const shopId = await getShopId();
  const PRODUCT_ID = "69cc7f39a297aa182b0ee7ae";
  const product = await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`) as any;
  
  const all = product.variants ?? [];
  console.log(`Total variants on product: ${all.length}`);
  console.log(`Enabled: ${all.filter((v: any) => v.is_enabled).length}`);
  console.log(`Disabled: ${all.filter((v: any) => !v.is_enabled).length}`);
  
  // Show first few disabled ones
  const disabled = all.filter((v: any) => !v.is_enabled).slice(0, 5);
  for (const v of disabled) {
    console.log(`  DISABLED id=${v.id} title=${v.title}`);
  }

  // Check what the current print_areas look like in full
  console.log("\nCurrent print_areas:");
  for (const pa of product.print_areas ?? []) {
    console.log(`  variant_ids count: ${(pa.variant_ids ?? []).length}`);
    console.log(`  variant_ids: [${(pa.variant_ids ?? []).slice(0,5).join(",")}...]`);
    for (const ph of pa.placeholders ?? []) {
      console.log(`  position: ${ph.position}, images: ${(ph.images ?? []).length}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
