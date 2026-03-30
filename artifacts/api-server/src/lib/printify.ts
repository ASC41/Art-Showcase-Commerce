const PRINTIFY_API_KEY = process.env.PRINTIFY_API_KEY;
const PRINTIFY_BASE = "https://api.printify.com/v1";

async function printifyRequest(path: string, options: RequestInit = {}) {
  if (!PRINTIFY_API_KEY) {
    throw new Error("PRINTIFY_API_KEY not configured");
  }
  const res = await fetch(`${PRINTIFY_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${PRINTIFY_API_KEY}`,
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

async function getShopId(): Promise<string> {
  const envShopId = process.env.PRINTIFY_SHOP_ID;
  if (envShopId) {
    return envShopId;
  }
  // Dynamic fallback when PRINTIFY_SHOP_ID is not set
  const shops = (await printifyRequest("/shops.json")) as Array<{
    id: string | number;
  }>;
  if (!shops || shops.length === 0) {
    throw new Error("No Printify shops found");
  }
  const shopId = String(shops[0].id);
  console.warn(
    `PRINTIFY_SHOP_ID not set — using first shop: ${shopId}. ` +
      `Set PRINTIFY_SHOP_ID to avoid ambiguity in multi-shop accounts.`
  );
  return shopId;
}

export interface PrintifyOrderOpts {
  artworkTitle: string;
  artworkImageUrl: string;
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

export async function createPrintOrder(opts: PrintifyOrderOpts): Promise<string | null> {
  if (!PRINTIFY_API_KEY) {
    console.warn("PRINTIFY_API_KEY not set — skipping Printify order");
    return null;
  }

  const PRINTIFY_PRODUCT_ID = process.env.PRINTIFY_PRODUCT_ID;
  const PRINTIFY_VARIANT_ID = process.env.PRINTIFY_VARIANT_ID
    ? parseInt(process.env.PRINTIFY_VARIANT_ID, 10)
    : null;

  if (!PRINTIFY_PRODUCT_ID || !PRINTIFY_VARIANT_ID) {
    console.warn(
      "PRINTIFY_PRODUCT_ID or PRINTIFY_VARIANT_ID not set — skipping Printify fulfillment. " +
        "Set these environment variables after creating your print product in Printify."
    );
    return null;
  }

  try {
    const shopId = await getShopId();

    const order = await printifyRequest(`/shops/${shopId}/orders.json`, {
      method: "POST",
      body: JSON.stringify({
        external_id: `rc-${Date.now()}`,
        label: `Print: ${opts.artworkTitle}`,
        line_items: [
          {
            product_id: PRINTIFY_PRODUCT_ID,
            variant_id: PRINTIFY_VARIANT_ID,
            quantity: 1,
          },
        ],
        shipping_method: 1,
        is_printify_express: false,
        send_shipping_notification: true,
        address_to: opts.shippingAddress,
      }),
    }) as { id: string };

    // Publish (submit to production)
    await printifyRequest(
      `/shops/${shopId}/orders/${order.id}/send_to_production.json`,
      { method: "POST" }
    );

    console.log(`Printify order created: ${order.id}`);
    return order.id;
  } catch (err) {
    console.error("Printify order error:", err);
    return null;
  }
}
