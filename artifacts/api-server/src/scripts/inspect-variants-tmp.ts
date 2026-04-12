import { printifyRequest, getShopId } from "../lib/printify.js";

async function main() {
  const shopId = await getShopId();
  const PRODUCT_ID = "69cc7f39a297aa182b0ee7ae";
  const product = await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`) as any;
  
  const enabled = (product.variants ?? []).filter((v: any) => v.is_enabled);
  console.log(`Enabled variants (${enabled.length}):`);
  for (const v of enabled) {
    console.log(`  id=${v.id}  title=${v.title}  enabled=${v.is_enabled}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
