import { printifyRequest, getShopId } from "../lib/printify.js";

async function main() {
  const shopId = await getShopId();
  const PRODUCT_ID = "69cc7f4514601e639c0ccd4a";
  
  // Archive (unpublish) first, then delete
  try {
    await printifyRequest(`/shops/${shopId}/products/${PRODUCT_ID}.json`, {
      method: "DELETE",
    });
    console.log("Deleted from Printify:", PRODUCT_ID);
  } catch(e: any) {
    console.log("Delete result:", e?.message ?? e);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
