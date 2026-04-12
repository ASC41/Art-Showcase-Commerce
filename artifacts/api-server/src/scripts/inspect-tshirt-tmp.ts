import { printifyRequest, getShopId } from "../lib/printify.js";

async function main() {
  const shopId = await getShopId();
  const PRODUCT_ID = "69cc7f39a297aa182b0ee7ae";
  
  console.log("=== Fetching existing t-shirt product print areas...");
  const product = await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`) as any;
  
  console.log("Print areas on existing product:");
  for (const pa of product.print_areas ?? []) {
    const vids = (pa.variant_ids ?? []).slice(0, 3).join(",") + "...";
    console.log(`  variants: [${vids}]`);
    for (const ph of pa.placeholders ?? []) {
      console.log(`    position: ${ph.position}  images: ${(ph.images ?? []).length}`);
    }
  }

  console.log("\n=== Fetching blueprint 706 + provider 217 print provider details...");
  const pp = await printifyRequest(`/catalog/blueprints/706/print_providers/217/variants.json`) as any;
  console.log("Variant count:", (pp.variants ?? pp.enabled ?? []).length);
  
  console.log("\n=== Fetching blueprint 706 print areas from catalog...");
  try {
    const areas = await printifyRequest(`/catalog/blueprints/706/print_providers/217.json`) as any;
    console.log("Print areas from catalog:", JSON.stringify(areas).slice(0, 500));
  } catch(e) {
    console.log("Catalog endpoint error:", String(e));
  }
  
  console.log("\nProduct image sample (first 6):");
  for (const img of (product.images ?? []).slice(0, 6)) {
    console.log(`  variant=${img.variant_ids?.[0]}  label=${img.src?.match(/camera_label=([^&]+)/)?.[1]}  src=${img.src?.slice(0,80)}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
