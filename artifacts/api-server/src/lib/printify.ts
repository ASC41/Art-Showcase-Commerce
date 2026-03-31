import fs from "fs";
import path from "path";

const PRINTIFY_BASE = "https://api.printify.com/v1";

export type PrintSize = "11x14" | "18x24" | "24x36";
export type PrintType = "matte" | "framed";
export type PrintOrientation = "portrait" | "landscape";

// Canonical size list — all three must be present for a product to be considered valid.
// Used by both the provisioning script and runtime checkout validation.
export const REQUIRED_PRINT_SIZES: PrintSize[] = ["11x14", "18x24", "24x36"];

// Maps each PrintSize to the inch dimensions used to match Printify variant titles.
// Portrait orientation (width < height).
export const PRINT_SIZE_INCHES_PORTRAIT: Record<PrintSize, { w: number; h: number }> = {
  "11x14": { w: 11, h: 14 },
  "18x24": { w: 18, h: 24 },
  "24x36": { w: 24, h: 36 },
};

// Landscape orientation (width > height) — same size tier, different orientation.
export const PRINT_SIZE_INCHES_LANDSCAPE: Record<PrintSize, { w: number; h: number }> = {
  "11x14": { w: 14, h: 11 },
  "18x24": { w: 24, h: 18 },
  "24x36": { w: 36, h: 24 },
};

export interface PrintifyBlueprintConfig {
  blueprintId: number;
  printProviderId: number;
  variantIds: {
    portrait: Record<PrintSize, number>;
    landscape: Record<PrintSize, number>;
  };
}

export interface PrintifyConfig {
  matte: PrintifyBlueprintConfig;
  framed: PrintifyBlueprintConfig;
}

// ── Config loading ────────────────────────────────────────────────────────────
let _config: PrintifyConfig | null = null;
let _configLoadAttempted = false;

export function loadPrintifyConfig(): PrintifyConfig | null {
  if (_configLoadAttempted) return _config;
  _configLoadAttempted = true;

  // 1. Try env var first (most reliable across deploys)
  const envJson = process.env.PRINTIFY_BLUEPRINT_CONFIG;
  if (envJson) {
    try {
      _config = JSON.parse(envJson) as PrintifyConfig;
      console.log("[printify] Blueprint config loaded from PRINTIFY_BLUEPRINT_CONFIG env var");
      return _config;
    } catch {
      console.warn("[printify] PRINTIFY_BLUEPRINT_CONFIG is set but invalid JSON — falling back to file");
    }
  }

  // 2. Fall back to local file (written by provisioning script)
  const configPath = path.resolve(process.cwd(), "src/config/printify-blueprints.json");
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    _config = JSON.parse(raw) as PrintifyConfig;
    console.log(`[printify] Blueprint config loaded from ${configPath}`);
    console.warn(
      "[printify] TIP: copy the JSON from printify-blueprints.json into the " +
        "PRINTIFY_BLUEPRINT_CONFIG secret so it survives clean deploys."
    );
  } catch {
    console.warn(
      `[printify] Blueprint config not found (checked env PRINTIFY_BLUEPRINT_CONFIG and ${configPath}). ` +
        `Run 'pnpm --filter @workspace/api-server run provision-printify' and set ` +
        `PRINTIFY_BLUEPRINT_CONFIG. Print purchases will return 400 until configured.`
    );
  }
  return _config;
}

export function getVariantId(
  type: PrintType,
  size: PrintSize,
  orientation: PrintOrientation = "portrait"
): number | null {
  const cfg = loadPrintifyConfig();
  return cfg?.[type]?.variantIds?.[orientation]?.[size] ?? null;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
export async function printifyRequest(path: string, options: RequestInit = {}) {
  const apiKey = process.env.PRINTIFY_API_KEY;
  if (!apiKey) {
    throw new Error("PRINTIFY_API_KEY not configured");
  }
  const res = await fetch(`${PRINTIFY_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Printify API error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function getShopId(): Promise<string> {
  const envShopId = process.env.PRINTIFY_SHOP_ID;
  if (envShopId) return envShopId;
  const shops = (await printifyRequest("/shops.json")) as Array<{
    id: string | number;
  }>;
  if (!shops || shops.length === 0) throw new Error("No Printify shops found");
  const shopId = String(shops[0].id);
  console.warn(
    `PRINTIFY_SHOP_ID not set — using first shop: ${shopId}. ` +
      `Set PRINTIFY_SHOP_ID to avoid ambiguity in multi-shop accounts.`
  );
  return shopId;
}

// ── Order creation ────────────────────────────────────────────────────────────
export interface PrintifyOrderOpts {
  artworkTitle: string;
  productId: string;
  variantId: number;
  customerEmail: string;
  shippingAddress: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    country: string;
    region: string;
    address1: string;
    city: string;
    zip: string;
  };
}

export async function createPrintOrder(
  opts: PrintifyOrderOpts
): Promise<string> {
  const apiKey = process.env.PRINTIFY_API_KEY;
  if (!apiKey) throw new Error("PRINTIFY_API_KEY not configured");

  const shopId = await getShopId();

  const order = (await printifyRequest(`/shops/${shopId}/orders.json`, {
    method: "POST",
    body: JSON.stringify({
      external_id: `rc-${Date.now()}`,
      label: `Print: ${opts.artworkTitle}`,
      line_items: [
        {
          product_id: opts.productId,
          variant_id: opts.variantId,
          quantity: 1,
        },
      ],
      shipping_method: 1,
      is_printify_express: false,
      send_shipping_notification: true,
      address_to: opts.shippingAddress,
    }),
  })) as { id: string };

  await printifyRequest(
    `/shops/${shopId}/orders/${order.id}/send_to_production.json`,
    { method: "POST" }
  );

  console.log(`Printify order created: ${order.id}`);
  return order.id;
}
