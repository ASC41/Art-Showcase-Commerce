import { printifyRequest, getShopId } from "../lib/printify.js";

async function main() {
  const shopId = await getShopId();
  const PRODUCT_ID = "69cc7f39a297aa182b0ee7ae";
  const product = await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`) as any;

  // Check back area dimensions from Printify catalog
  // Blueprint 706, provider 217 - fetch print areas info
  try {
    const info = await printifyRequest(`/catalog/blueprints/706/print_providers/217/variants.json`) as any;
    // Look for print area size info
    console.log("Sample variant:", JSON.stringify((info.variants ?? [])[0]).slice(0,200));
  } catch(e) { console.log("catalog variants error:", String(e).slice(0,80)); }

  // Check actual product dimensions by looking at image proportions
  console.log("\nProduct image sample:");
  for (const img of (product.images ?? []).filter((i:any) => i.src?.includes("back") && !i.src?.includes("person")).slice(0,2)) {
    const label = img.src?.match(/camera_label=([^&]+)/)?.[1];
    const vid = img.src?.match(/\/mockup\/[^/]+\/(\d+)\//)?.[1];
    console.log(`  label=${label} variant=${vid}`);
    console.log(`  ${img.src}`);
  }

  // Also check what Printify returns for blueprint 706 print areas
  try {
    const bp = await printifyRequest(`/catalog/blueprints/706.json`) as any;
    console.log("\nBlueprint title:", bp.title);
    console.log("Print area options:", JSON.stringify(bp.print_area_options ?? bp.print_areas ?? "n/a").slice(0,300));
  } catch(e) { console.log("blueprint error:", String(e).slice(0,80)); }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
