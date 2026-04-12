import { printifyRequest, getShopId } from "../lib/printify.js";

async function main() {
  const shopId = await getShopId();
  const product = await printifyRequest(
    `/shops/${shopId}/products/69cc7f41bc99c0222409dfd4.json`
  ) as any;

  // All variant IDs in print_areas
  const allVarIds = new Set<number>();
  for (const pa of product.print_areas ?? []) {
    for (const vid of pa.variant_ids) allVarIds.add(vid);
  }
  console.log(`Blueprint variants in print_areas: ${allVarIds.size}`);

  // Existing front placeholder
  const frontPa = product.print_areas?.find((pa:any) =>
    pa.placeholders?.some((ph:any) => ph.position === "front")
  );
  const frontPh = frontPa?.placeholders?.find((ph:any) => ph.position === "front");
  console.log(`Front placeholder img ID: ${frontPh?.images?.[0]?.id}`);
  console.log(`Front img dims: ${frontPh?.images?.[0]?.width}×${frontPh?.images?.[0]?.height}`);
  console.log(`Front img scale: ${frontPh?.images?.[0]?.scale}`);

  // All available camera labels
  const cameraLabels = new Set<string>();
  for (const img of product.images ?? []) {
    const label = img.src?.match(/camera_label=([^&]+)/)?.[1];
    if (label) cameraLabels.add(label);
  }
  console.log("\nAvailable camera labels:", [...cameraLabels].join(", "));

  // Does any camera label contain "wrist" or "sleeve"?
  const wristCams = [...cameraLabels].filter(l => l.includes("wrist") || l.includes("sleeve") || l.includes("cuff"));
  console.log("Wrist/sleeve cameras:", wristCams.join(", ") || "NONE");
  
  // Show a sample wrist/sleeve image URL if exists
  for (const img of product.images ?? []) {
    const label = img.src?.match(/camera_label=([^&]+)/)?.[1] ?? "";
    if (label.includes("wrist") || label.includes("sleeve")) {
      console.log(`  Sample wrist/sleeve: ${img.src}`);
      break;
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
