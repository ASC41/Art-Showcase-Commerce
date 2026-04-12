import { printifyRequest } from "../lib/printify.js";

async function main() {
  // Check available positions from a crewneck variant's placeholders
  const info = await printifyRequest(
    `/catalog/blueprints/49/print_providers/217/variants.json`
  ) as any;

  const sampleVariant = (info.variants ?? [])[0];
  if (sampleVariant) {
    console.log("Positions available for variant:", JSON.stringify(sampleVariant.placeholders?.map((p:any) => ({
      position: p.position,
      method: p.decoration_method,
      width: p.width,
      height: p.height,
    })), null, 2));
  }

  // Also check all unique positions across variants
  const positions = new Map<string, {method:string, w:number, h:number}>();
  for (const v of (info.variants ?? [])) {
    for (const ph of (v.placeholders ?? [])) {
      if (!positions.has(ph.position)) {
        positions.set(ph.position, { method: ph.decoration_method, w: ph.width, h: ph.height });
      }
    }
  }
  console.log("\nAll unique print positions for Blueprint 49 + Provider 217:");
  for (const [pos, info2] of positions) {
    console.log(`  ${pos}: ${info2.method} ${info2.w}×${info2.h}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
