import fs from "fs";
import path from "path";

const PRINTIFY_BASE = "https://api.printify.com/v1";

export type PrintSize = "8x11" | "11x14" | "12x18" | "16x20";
export type PrintType = "matte";
export type PrintOrientation = "portrait" | "landscape";

// Canonical size list — all four must be present for a product to be considered valid.
// Used by both the provisioning script and runtime checkout validation.
export const REQUIRED_PRINT_SIZES: PrintSize[] = ["8x11", "11x14", "12x18", "16x20"];

// Maps each PrintSize to the inch dimensions used to match Printify variant titles.
// Portrait orientation (width < height).
export const PRINT_SIZE_INCHES_PORTRAIT: Record<PrintSize, { w: number; h: number }> = {
  "8x11":  { w: 8,  h: 11 },
  "11x14": { w: 11, h: 14 },
  "12x18": { w: 12, h: 18 },
  "16x20": { w: 16, h: 20 },
};

// Landscape orientation (width > height) — same size tier, different orientation.
export const PRINT_SIZE_INCHES_LANDSCAPE: Record<PrintSize, { w: number; h: number }> = {
  "8x11":  { w: 11, h: 8  },
  "11x14": { w: 14, h: 11 },
  "12x18": { w: 18, h: 12 },
  "16x20": { w: 20, h: 16 },
};

// Giclée Art Print Blueprint 494, provider 36 (Print Pigeons)
// Variant IDs sourced from the Printify catalog
export const GICLEE_VARIANT_IDS: {
  portrait: Record<PrintSize, number>;
  landscape: Record<PrintSize, number>;
} = {
  portrait:  { "8x11": 66037, "11x14": 66039, "12x18": 66043, "16x20": 66047 },
  landscape: { "8x11": 66033, "11x14": 66041, "12x18": 66045, "16x20": 66232 },
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
}

// ── Config loading ────────────────────────────────────────────────────────────
let _config: PrintifyConfig | null = null;
let _configLoadAttempted = false;

// Returns null if the config is missing required Giclée sizes or uses a legacy blueprint.
function validateGicleeConfig(cfg: PrintifyConfig): PrintifyConfig | null {
  const matte = cfg?.matte;
  if (!matte) return null;

  // Reject legacy Blueprint 983 (old matte poster) or Blueprint 1236 (framed)
  if (matte.blueprintId !== 494) {
    console.warn(
      `[printify] Config rejected: blueprintId ${matte.blueprintId} is not Giclée Blueprint 494. ` +
        "Falling through to hardcoded defaults."
    );
    return null;
  }

  // Verify all four required sizes are present in both orientations
  for (const orientation of ["portrait", "landscape"] as const) {
    for (const size of REQUIRED_PRINT_SIZES) {
      if (!matte.variantIds?.[orientation]?.[size]) {
        console.warn(
          `[printify] Config rejected: missing variantId for ${orientation} ${size}. ` +
            "Falling through to hardcoded defaults."
        );
        return null;
      }
    }
  }
  return cfg;
}

export function loadPrintifyConfig(): PrintifyConfig | null {
  if (_configLoadAttempted) return _config;
  _configLoadAttempted = true;

  // 1. Try env var first (most reliable across deploys)
  const envJson = process.env.PRINTIFY_BLUEPRINT_CONFIG;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson) as PrintifyConfig;
      const validated = validateGicleeConfig(parsed);
      if (validated) {
        _config = validated;
        console.log("[printify] Blueprint config loaded from PRINTIFY_BLUEPRINT_CONFIG env var");
        return _config;
      }
    } catch {
      console.warn("[printify] PRINTIFY_BLUEPRINT_CONFIG is set but invalid JSON — falling back to file");
    }
  }

  // 2. Fall back to local file (written by provisioning script)
  const configPath = path.resolve(process.cwd(), "src/config/printify-blueprints.json");
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as PrintifyConfig;
    const validated = validateGicleeConfig(parsed);
    if (validated) {
      _config = validated;
      console.log(`[printify] Blueprint config loaded from ${configPath}`);
      console.warn(
        "[printify] TIP: copy the JSON from printify-blueprints.json into the " +
          "PRINTIFY_BLUEPRINT_CONFIG secret so it survives clean deploys."
      );
      return _config;
    }
  } catch {
    // file not found — fall through
  }

  // 3. Always fall back to hardcoded Giclée blueprint config
  _config = {
    matte: {
      blueprintId: 494,
      printProviderId: 36,
      variantIds: GICLEE_VARIANT_IDS,
    },
  };
  console.log("[printify] Using hardcoded Giclée blueprint config (Blueprint 494, Provider 36)");
  return _config;
}

export function getVariantId(
  _type: PrintType,
  size: PrintSize,
  orientation: PrintOrientation = "portrait"
): number | null {
  const cfg = loadPrintifyConfig();
  return cfg?.matte?.variantIds?.[orientation]?.[size] ?? null;
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
