import fs from "fs";
import path from "path";

const PRINTIFY_BASE = "https://api.printify.com/v1";

// Three tiers: small (8×10), medium (12×18), large (16×20).
// Labels flip by orientation (e.g. 16×20 portrait → 20×16 landscape).
export type PrintSize = "8x10" | "12x18" | "16x20";
export type PrintType = "matte";
export type PrintOrientation = "portrait" | "landscape";

// Canonical size list — all offered sizes must be present for a product to be valid.
export const REQUIRED_PRINT_SIZES: PrintSize[] = ["8x10", "12x18", "16x20"];

// Maps each PrintSize to the inch dimensions used to match Printify variant titles.
// Portrait orientation (width < height).
export const PRINT_SIZE_INCHES_PORTRAIT: Record<PrintSize, { w: number; h: number }> = {
  "8x10":  { w: 8,  h: 10 },
  "12x18": { w: 12, h: 18 },
  "16x20": { w: 16, h: 20 },
};

// Landscape orientation (width > height) — same size tier, flipped dimensions.
export const PRINT_SIZE_INCHES_LANDSCAPE: Record<PrintSize, { w: number; h: number }> = {
  "8x10":  { w: 10, h: 8  },
  "12x18": { w: 18, h: 12 },
  "16x20": { w: 20, h: 16 },
};

// Fine Art Print — Blueprint 804 (Fine Art Posters), provider 72 (Print Clever, US-accessible)
// Variant IDs sourced from the Printify catalog — 220gsm archival matte paper, giclée technique
export const GICLEE_VARIANT_IDS: {
  portrait: Record<PrintSize, number>;
  landscape: Record<PrintSize, number>;
} = {
  portrait:  { "8x10": 75288, "12x18": 75291, "16x20": 75292 },
  landscape: { "8x10": 75299, "12x18": 75302, "16x20": 75304 },
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

// Returns null if the config is missing required print sizes or uses an unrecognized blueprint.
function validateGicleeConfig(cfg: PrintifyConfig): PrintifyConfig | null {
  const matte = cfg?.matte;
  if (!matte) return null;

  // Accept Blueprint 804 (Print Clever Fine Art Posters, current) and legacy 494 (Print Pigeons).
  // Reject any other blueprint IDs that may be stale config.
  if (matte.blueprintId !== 804 && matte.blueprintId !== 494) {
    console.warn(
      `[printify] Config rejected: blueprintId ${matte.blueprintId} is not a recognised fine art print blueprint. ` +
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

  // 3. Always fall back to hardcoded Fine Art Print blueprint config
  _config = {
    matte: {
      blueprintId: 804,
      printProviderId: 72,
      variantIds: GICLEE_VARIANT_IDS,
    },
  };
  console.log("[printify] Using hardcoded Fine Art Print config (Blueprint 804, Provider 72 — Print Clever)");
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

// ── Shipping rates ─────────────────────────────────────────────────────────────

export interface ShippingProfile {
  countries: string[];
  firstItemCents: number;
  additionalItemCents: number;
}

export interface BlueprintShippingRates {
  profiles: ShippingProfile[];
  cachedAt: number;
}

const shippingCache = new Map<string, BlueprintShippingRates>();
const SHIPPING_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function getBlueprintShippingRates(
  blueprintId: number,
  printProviderId: number
): Promise<BlueprintShippingRates> {
  const key = `${blueprintId}-${printProviderId}`;
  const cached = shippingCache.get(key);
  if (cached && Date.now() - cached.cachedAt < SHIPPING_CACHE_TTL_MS) {
    return cached;
  }
  try {
    const data = (await printifyRequest(
      `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/shipping.json`
    )) as {
      profiles: Array<{
        countries: string[];
        first_item: { cost: number };
        additional_items: { cost: number };
      }>;
    };
    const rates: BlueprintShippingRates = {
      profiles: (data.profiles ?? []).map((p) => ({
        countries: p.countries ?? [],
        firstItemCents: p.first_item?.cost ?? 0,
        additionalItemCents: p.additional_items?.cost ?? 0,
      })),
      cachedAt: Date.now(),
    };
    shippingCache.set(key, rates);
    return rates;
  } catch {
    const fallback: BlueprintShippingRates = {
      profiles: [
        { countries: ["US"], firstItemCents: 499, additionalItemCents: 0 },
        { countries: ["CA"], firstItemCents: 999, additionalItemCents: 0 },
        { countries: ["REST_OF_THE_WORLD"], firstItemCents: 1299, additionalItemCents: 0 },
      ],
      cachedAt: Date.now(),
    };
    shippingCache.set(key, fallback);
    return fallback;
  }
}

export function shippingCostForCountry(
  rates: BlueprintShippingRates,
  countryCode: string
): number {
  let restOfWorld: number | null = null;
  let maxCost = 0;
  for (const profile of rates.profiles) {
    if (profile.countries.includes(countryCode)) {
      maxCost = Math.max(maxCost, profile.firstItemCents);
    }
    if (profile.countries.includes("REST_OF_THE_WORLD")) {
      restOfWorld = profile.firstItemCents;
    }
  }
  if (maxCost > 0) return maxCost;
  if (restOfWorld !== null) return restOfWorld;
  return 1299;
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
