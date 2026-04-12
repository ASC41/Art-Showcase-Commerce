import { printifyRequest } from "../lib/printify.js";

async function main() {
  // Try different catalog endpoints to find available print areas
  console.log("=== Blueprint 706 print providers...");
  try {
    const res = await printifyRequest(`/catalog/blueprints/706/print_providers.json`) as any;
    for (const pp of (res ?? [])) {
      console.log(`  id=${pp.id} title=${pp.title}`);
    }
  } catch(e) {
    console.log("Error:", String(e));
  }
  
  // Try to fetch a test product creation response to see what positions are possible.
  // Actually let's look at what camera labels all images have (enumerate all)
  const PRODUCT_ID = "69cc7f39a297aa182b0ee7ae";
  const SHOP_ID = process.env.PRINTIFY_SHOP_ID;
  const res = await fetch(`https://api.printify.com/v1/shops/${SHOP_ID}/products/${PRODUCT_ID}.json`, {
    headers: { Authorization: `Bearer ${process.env.PRINTIFY_API_KEY}` }
  });
  const product = await res.json() as any;
  
  console.log("\n=== All camera labels on existing t-shirt product:");
  const labels = new Set<string>();
  for (const img of product.images ?? []) {
    const label = img.src?.match(/camera_label=([^&]+)/)?.[1] ?? "no-label";
    labels.add(label);
  }
  for (const l of [...labels].sort()) {
    console.log(`  ${l}`);
  }
  
  console.log(`\nTotal mockup images: ${(product.images ?? []).length}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
