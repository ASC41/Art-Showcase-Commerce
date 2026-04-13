import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, artworksTable } from "@workspace/db";
import {
  merchProductsTable,
  merchOrdersTable,
  merchArtworkProductsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { printifyRequest, getShopId, getBlueprintShippingRates } from "../lib/printify";
import { buildStripeShippingOptions } from "../lib/shipping";
import { sendOrderNotification } from "../lib/mailer";

const router: IRouter = Router();

const MerchCheckoutBody = z.object({
  merchSlug: z.string().min(1),
  variantId: z.number().int().positive(),
  artworkSlug: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  customerEmail: z.string().email().optional(),
});

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

// ── POST /api/checkout/merch-session ─────────────────────────────────────────
router.post("/checkout/merch-session", async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Payment processing not configured" });
    return;
  }

  try {
    const body = MerchCheckoutBody.parse(req.body);
    const { merchSlug, variantId, artworkSlug, successUrl, cancelUrl, customerEmail } = body;

    // Look up the merch product
    const [merch] = await db
      .select()
      .from(merchProductsTable)
      .where(and(eq(merchProductsTable.slug, merchSlug), eq(merchProductsTable.isActive, true)))
      .limit(1);

    if (!merch) {
      res.status(404).json({ error: "Merch product not found" });
      return;
    }

    // Validate the variantId belongs to this product
    const variants = (merch.variants ?? []) as Array<{ id: number; title: string; color: string; size: string; priceCents?: number }>;
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) {
      res.status(400).json({ error: "Invalid variant for this product" });
      return;
    }

    // Look up the artwork
    const [artwork] = await db
      .select()
      .from(artworksTable)
      .where(eq(artworksTable.slug, artworkSlug))
      .limit(1);

    if (!artwork) {
      res.status(404).json({ error: "Artwork not found" });
      return;
    }

    const productName = `${artwork.title} × ${merch.name}`;
    const description = `${variant.title} — Artwork by Ryan Cellar — Printed on demand`;

    // Use per-variant price if available (e.g. giclée prints), else fall back to product price
    const unitAmount = variant.priceCents ?? merch.priceCents;

    // Fetch real Printify shipping rates for this blueprint (cached 4 hrs)
    const shippingRates = await getBlueprintShippingRates(
      merch.blueprintId,
      merch.printProviderId
    );
    const shippingOptions = buildStripeShippingOptions(shippingRates);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customerEmail ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data: {
              name: productName,
              description,
              images: [artwork.imageUrl],
            },
          },
        },
      ],
      metadata: {
        purchaseType: "merch",
        merchSlug,
        merchProductId: String(merch.id),
        variantId: String(variantId),
        variantTitle: variant.title,
        artworkSlug,
        artworkId: String(artwork.id),
        artworkTitle: artwork.title,
      },
      shipping_options: shippingOptions,
      phone_number_collection: { enabled: false },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" });
      return;
    }
    console.error("merch-checkout error:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Merch order fulfillment (called from webhook) ─────────────────────────────
export async function fulfillMerchOrder(session: Stripe.Checkout.Session): Promise<void> {
  const sessionId = session.id;
  const meta = session.metadata as {
    purchaseType: string;
    merchSlug: string;
    merchProductId: string;
    variantId: string;
    artworkSlug: string;
    artworkId: string;
    artworkTitle: string;
  };

  if (meta?.purchaseType !== "merch") return;

  // Idempotency guard
  const [existing] = await db
    .select()
    .from(merchOrdersTable)
    .where(eq(merchOrdersTable.stripeSessionId, sessionId))
    .limit(1);

  if (existing && ["paid", "fulfilled", "failed"].includes(existing.status)) {
    console.log(`fulfillMerchOrder: session ${sessionId} already in terminal state — skipping`);
    return;
  }

  const merchProductId = parseInt(meta.merchProductId, 10);
  const artworkId = parseInt(meta.artworkId, 10);
  const variantId = parseInt(meta.variantId, 10);

  // Upsert merch order row
  let didTransition = false;

  if (!existing) {
    const inserted = await db
      .insert(merchOrdersTable)
      .values({
        stripeSessionId: sessionId,
        merchProductId,
        artworkId,
        variantId,
        status: "paid",
        customerEmail: session.customer_details?.email ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: merchOrdersTable.id });
    didTransition = inserted.length > 0;
  } else {
    const updated = await db
      .update(merchOrdersTable)
      .set({ status: "paid" })
      .where(
        and(
          eq(merchOrdersTable.stripeSessionId, sessionId),
          eq(merchOrdersTable.status, "pending")
        )
      )
      .returning({ id: merchOrdersTable.id });
    didTransition = updated.length > 0;
  }

  if (!didTransition) {
    console.log(`fulfillMerchOrder: session ${sessionId} already handled by concurrent webhook`);
    return;
  }

  // Attempt Printify order creation
  try {
    const shippingDetails = session.collected_information?.shipping_details;
    const addr = shippingDetails?.address ?? session.customer_details?.address;
    const customerName = shippingDetails?.name ?? session.customer_details?.name ?? "Customer";
    const customerEmail = session.customer_details?.email ?? "";

    if (!addr?.line1 || !addr?.city || !addr?.country || !addr?.postal_code) {
      console.warn(`fulfillMerchOrder: missing shipping address for session ${sessionId}`);
      return;
    }

    // Look up or create the Printify product for this artwork × merch combo
    const [artworkProduct] = await db
      .select()
      .from(merchArtworkProductsTable)
      .where(
        and(
          eq(merchArtworkProductsTable.merchProductId, merchProductId),
          eq(merchArtworkProductsTable.artworkId, artworkId)
        )
      )
      .limit(1);

    // Determine which Printify product to use
    const [merch] = await db
      .select()
      .from(merchProductsTable)
      .where(eq(merchProductsTable.id, merchProductId))
      .limit(1);

    if (!merch) {
      console.error(`fulfillMerchOrder: merch product ${merchProductId} not found`);
      return;
    }

    // Use the per-artwork product if it exists, otherwise fall back to template
    const printifyProductId = artworkProduct?.printifyProductId ?? merch.printifyProductId;

    if (!printifyProductId) {
      console.error(`fulfillMerchOrder: no Printify product ID for merch ${merch.slug}`);
      return;
    }

    const shopId = await getShopId();

    const printifyOrder = await printifyRequest(`/shops/${shopId}/orders.json`, {
      method: "POST",
      body: JSON.stringify({
        external_id: sessionId,
        label: `RC-${sessionId.slice(-8).toUpperCase()}`,
        line_items: [
          {
            product_id: printifyProductId,
            variant_id: variantId,
            quantity: 1,
          },
        ],
        shipping_method: 1,
        is_printify_express: false,
        send_shipping_notification: true,
        address_to: {
          first_name: customerName.split(" ")[0] ?? customerName,
          last_name: customerName.split(" ").slice(1).join(" ") || ".",
          email: customerEmail,
          phone: session.customer_details?.phone ?? "",
          country: addr.country,
          region: addr.state ?? "",
          address1: addr.line1,
          address2: addr.line2 ?? "",
          city: addr.city,
          zip: addr.postal_code,
        },
      }),
    }) as { id?: string | number };

    if (printifyOrder?.id) {
      const orderId = String(printifyOrder.id);

      // CRITICAL: send to production so Printify actually prints and ships the order.
      // Without this call the order stays in draft/pending state indefinitely.
      await printifyRequest(
        `/shops/${shopId}/orders/${orderId}/send_to_production.json`,
        { method: "POST" }
      );

      await db
        .update(merchOrdersTable)
        .set({ printifyOrderId: orderId, status: "fulfilled" })
        .where(eq(merchOrdersTable.stripeSessionId, sessionId));

      console.log(`fulfillMerchOrder: Printify order ${orderId} created and sent to production`);

      // Notify Ryan of the sale (best-effort, non-blocking)
      sendOrderNotification({
        artworkTitle: meta.artworkTitle,
        purchaseType: "merch",
        customerEmail: session.customer_details?.email ?? null,
        stripeSessionId: sessionId,
        merchName: merch.name,
      }).catch((e) =>
        console.error("Merch sale email notification failed:", e instanceof Error ? e.message : String(e))
      );
    }
  } catch (err) {
    console.error(
      "fulfillMerchOrder Printify error:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

export default router;
