import fs from "fs";
import path from "path";

const PRINTIFY_BASE = "https://api.printify.com/v1";

export type PrintSize = "8x10" | "11x14" | "18x24" | "24x36";
export type PrintType = "matte" | "framed";

export interface PrintifyBlueprintConfig {
  blueprintId: number;
  printProviderId: number;
  variantIds: Record<PrintSize, number>;
}

export interface PrintifyConfig {
  matte: PrintifyBlueprintConfig;
  framed: PrintifyBlueprintConfig;
}

// ── Config loading ────────────────────────────────────────────────────────────
// Written by the provisioning script. Resolved via process.cwd() so the path
// works in both dev (tsx) and production (esbuild dist/index.cjs).
// Expected location: <api-server-root>/src/config/printify-blueprints.json
//
// Startup validation is performed once on first call. Missing config is allowed
// (prints are simply unavailable), but a clear warning is logged so operators know.
let _config: PrintifyConfig | null = null;
let _configLoadAttempted = false;
let _configPath: string;

try {
  // Resolve config path relative to the project root (process.cwd()) so it
  // works in both dev (tsx, cwd = api-server root) and esbuild bundles.
  _configPath = path.resolve(process.cwd(), "src/config/printify-blueprints.json");
} catch {
  _configPath = "";
}

export function loadPrintifyConfig(): PrintifyConfig | null {
  if (_configLoadAttempted) return _config;
  _configLoadAttempted = true;
  try {
    const raw = fs.readFileSync(_configPath, "utf-8");
    _config = JSON.parse(raw) as PrintifyConfig;
    console.log(`[printify] Blueprint config loaded from ${_configPath}`);
  } catch {
    console.warn(
      `[printify] Blueprint config not found at ${_configPath}. ` +
        `Run 'pnpm --filter @workspace/api-server run provision-printify' to create it. ` +
        `Print purchases will return 400 until provisioned.`
    );
  }
  return _config;
}

export function getVariantId(type: PrintType, size: PrintSize): number | null {
  const cfg = loadPrintifyConfig();
  return cfg?.[type]?.variantIds?.[size] ?? null;
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
