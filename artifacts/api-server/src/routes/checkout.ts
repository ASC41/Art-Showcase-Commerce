import { Router, type IRouter, type Request, type Response } from "express";
import { ZodError } from "zod";
import Stripe from "stripe";
import { db, artworksTable, ordersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateCheckoutSessionBody,
  CreateCheckoutSessionResponse,
  VerifyCheckoutBody,
  VerifyCheckoutResponse,
} from "@workspace/api-zod";
import { sendOrderNotification } from "../lib/mailer";
import {
  createPrintOrder,
  getVariantId,
  getBlueprintShippingRates,
  type PrintType,
  type PrintSize,
  type PrintOrientation,
} from "../lib/printify";
import { buildStripeShippingOptions } from "../lib/shipping";
import { fulfillMerchOrder } from "./merch-checkout";

const router: IRouter = Router();

const TERMINAL_STATUSES = ["paid", "fulfilled", "failed"] as const;

// ── Giclée print pricing (cents) ─────────────────────────────────────────────
// Three tiers: small ($45), medium ($75), large ($95).
const PRINT_PRICES: Record<PrintSize, number> = {
  "8x10":  4500,
  "12x18": 7500,
  "16x20": 9500,
};

// Labels are portrait-canonical; checkout.ts receives the size key and uses it
// for Stripe line-item naming regardless of actual print orientation.
const PRINT_SIZE_LABELS: Record<PrintSize, string> = {
  "8x10":  '8" × 10"',
  "12x18": '12" × 18"',
  "16x20": '16" × 20"',
};

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.warn("STRIPE_SECRET_KEY not set — checkout disabled");
    return null;
  }
  return new Stripe(key);
}

function successMessage(
  purchaseType: "original" | "print",
  status: string
): string {
  if (purchaseType === "original") {
    return "Ryan will be in touch shortly to arrange delivery of your original artwork.";
  }
  if (status === "failed") {
    return "Your payment was received. Our team will be in touch to arrange shipping of your print.";
  }
  return "Your fine art print is being prepared for shipping.";
}

// ── Shared fulfillment logic (called by webhook handler) ─────────────────────
// Fully idempotent: terminal-status orders short-circuit without re-triggering side effects.
async function fulfillOrder(
  session: Stripe.Checkout.Session
): Promise<void> {
  const sessionId = session.id;
  const meta = session.metadata as {
    artworkSlug: string;
    artworkId: string;
    purchaseType: "original" | "print";
    artworkTitle: string;
    printifyProductId?: string;
    printifyVariantId?: string;
  };

  if (!meta?.artworkSlug || !meta?.purchaseType) {
    console.warn(`fulfillOrder: missing metadata for session ${sessionId}`);
    return;
  }

  const { artworkSlug, artworkId, purchaseType, artworkTitle } = meta;

  // Idempotency guard — never re-run on terminal orders
  const [existing] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.stripeSessionId, sessionId))
    .limit(1);

  if (existing && (TERMINAL_STATUSES as readonly string[]).includes(existing.status)) {
    console.log(
      `fulfillOrder: session ${sessionId} already in terminal state '${existing.status}' — skipping`
    );
    return;
  }

  // Upsert order row — only proceed with side effects if this webhook
  // is the one that actually transitions the row to `paid`.
  let didTransition = false;

  if (!existing) {
    const inserted = await db
      .insert(ordersTable)
      .values({
        artworkId: parseInt(artworkId, 10),
        type: purchaseType,
        stripeSessionId: sessionId,
        status: "paid",
        customerEmail: session.customer_details?.email ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: ordersTable.id });
    didTransition = inserted.length > 0;
  } else {
    const updated = await db
      .update(ordersTable)
      .set({ status: "paid" })
      .where(
        and(
          eq(ordersTable.stripeSessionId, sessionId),
          eq(ordersTable.status, "pending")
        )
      )
      .returning({ id: ordersTable.id });
    didTransition = updated.length > 0;
  }

  if (!didTransition) {
    console.log(
      `fulfillOrder: session ${sessionId} was already handled by a concurrent webhook — skipping side effects`
    );
    return;
  }

  // Mark original as sold
  if (purchaseType === "original") {
    await db
      .update(artworksTable)
      .set({ status: "sold" })
      .where(eq(artworksTable.slug, artworkSlug));
  }

  // Email notification (best-effort, non-blocking)
  sendOrderNotification({
    artworkTitle,
    purchaseType,
    customerEmail: session.customer_details?.email ?? null,
    stripeSessionId: sessionId,
  }).catch((e) =>
    console.error(
      "Email notification failed:",
      e instanceof Error ? e.message : String(e)
    )
  );

  // Printify fulfillment for prints
  if (purchaseType === "print") {
    const shippingDetails = session.collected_information?.shipping_details;
    const addr = shippingDetails?.address ?? session.customer_details?.address;
    const customerName =
      shippingDetails?.name ?? session.customer_details?.name ?? "Customer";
    const customerEmail = session.customer_details?.email ?? "";

    const missingFields: string[] = [];
    if (!addr?.line1) missingFields.push("address line 1");
    if (!addr?.city) missingFields.push("city");
    if (!addr?.country) missingFields.push("country");
    if (!addr?.postal_code) missingFields.push("postal code");

    if (missingFields.length > 0) {
      console.warn(
        `Print fulfillment: missing shipping fields [${missingFields.join(", ")}] ` +
          `for session ${sessionId}. Artist must fulfil manually.`
      );
      await db
        .update(ordersTable)
        .set({ status: "failed" })
        .where(eq(ordersTable.stripeSessionId, sessionId));
      return;
    }

    const printifyProductId = meta.printifyProductId;
    const printifyVariantId = meta.printifyVariantId
      ? parseInt(meta.printifyVariantId, 10)
      : null;

    if (!printifyProductId || !printifyVariantId) {
      console.warn(
        `Print fulfillment: no Printify product/variant in metadata for session ${sessionId}. ` +
          `Run provision-printify script first.`
      );
      await db
        .update(ordersTable)
        .set({ status: "failed" })
        .where(eq(ordersTable.stripeSessionId, sessionId));
      return;
    }

    const nameParts = customerName.split(" ");
    const firstName = nameParts[0] ?? "Customer";
    const lastName = nameParts.slice(1).join(" ") || "Buyer";

    createPrintOrder({
      artworkTitle,
      productId: printifyProductId,
      variantId: printifyVariantId,
      customerEmail,
      shippingAddress: {
        first_name: firstName,
        last_name: lastName,
        email: customerEmail,
        country: addr!.country ?? "US",
        region: addr!.state ?? "",
        address1: addr!.line1 ?? "",
        city: addr!.city ?? "",
        zip: addr!.postal_code ?? "",
      },
    })
      .then(async (printifyOrderId) => {
        await db
          .update(ordersTable)
          .set({ printifyOrderId, status: "fulfilled" })
          .where(eq(ordersTable.stripeSessionId, sessionId));
        console.log(`Print order fulfilled via Printify: ${printifyOrderId}`);
      })
      .catch(async (e) => {
        console.error(
          "Printify order failed:",
          e instanceof Error ? e.message : String(e)
        );
        await db
          .update(ordersTable)
          .set({ status: "failed" })
          .where(eq(ordersTable.stripeSessionId, sessionId));
      });
  } else {
    // Original — artist ships manually; mark fulfilled immediately
    await db
      .update(ordersTable)
      .set({ status: "fulfilled" })
      .where(eq(ordersTable.stripeSessionId, sessionId));
  }
}

// ── POST /api/checkout/webhook — Stripe webhook receiver ─────────────────────
export async function handleStripeWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn("STRIPE_WEBHOOK_SECRET not set — webhook disabled");
    res.status(503).json({ error: "Webhook not configured" });
    return;
  }

  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    res.status(400).json({ error: "Missing Stripe-Signature header" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error(
      "Webhook signature verification failed:",
      err instanceof Error ? err.message : String(err)
    );
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status === "paid") {
      const purchaseType = session.metadata?.purchaseType;
      try {
        if (purchaseType === "merch") {
          await fulfillMerchOrder(session);
        } else {
          await fulfillOrder(session);
        }
      } catch (err) {
        console.error(
          "fulfillment infrastructure error — returning 500 for Stripe retry:",
          err instanceof Error ? err.message : String(err)
        );
        res.status(500).json({ error: "Fulfillment failed — will retry" });
        return;
      }
    }
  }

  res.json({ received: true });
}

// ── POST /api/checkout/session — create a Stripe checkout session ─────────────
router.post("/checkout/session", async (req, res) => {
  try {
    const body = CreateCheckoutSessionBody.parse(req.body);
    const {
      artworkSlug,
      purchaseType,
      customerEmail,
      successUrl,
      cancelUrl,
      printType,
      printSize,
    } = body;

    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Payment processing not configured" });
      return;
    }

    const [artwork] = await db
      .select()
      .from(artworksTable)
      .where(eq(artworksTable.slug, artworkSlug))
      .limit(1);

    if (!artwork) {
      res.status(404).json({ error: "Artwork not found" });
      return;
    }

    if (purchaseType === "original") {
      if (artwork.status !== "available") {
        res
          .status(400)
          .json({ error: "This original is not available for purchase" });
        return;
      }
      if (!artwork.price) {
        res.status(400).json({ error: "This artwork has no price set" });
        return;
      }
    }

    // Validate print options
    if (purchaseType === "print") {
      if (!printType || !printSize) {
        res
          .status(400)
          .json({ error: "printType and printSize are required for print purchases" });
        return;
      }
    }

    // Resolve Printify product/variant for prints
    let printifyProductId: string | null = null;
    let printifyVariantId: number | null = null;

    if (purchaseType === "print" && printType && printSize) {
      printifyProductId = artwork.printifyMatteProductId;

      const orientation: PrintOrientation =
        artwork.imageWidth && artwork.imageHeight && artwork.imageWidth > artwork.imageHeight
          ? "landscape"
          : "portrait";

      printifyVariantId = getVariantId(printType, printSize, orientation);

      if (!printifyProductId || !printifyVariantId) {
        const missing: string[] = [];
        if (!printifyProductId) missing.push(`${printType} product`);
        if (!printifyVariantId) missing.push(`${printType}/${printSize} variant`);
        console.warn(
          `[checkout] Print order blocked — missing Printify mapping [${missing.join(", ")}] ` +
            `for artwork "${artworkSlug}". Run provision-printify to enable.`
        );
        res.status(400).json({
          error:
            "This print option is not yet available. Please contact the artist or try again soon.",
        });
        return;
      }
    }

    // Pricing
    const unitAmount =
      purchaseType === "original"
        ? artwork.price!
        : PRINT_PRICES[printSize as PrintSize];

    const sizeLabel =
      purchaseType === "print" && printSize
        ? ` — ${PRINT_SIZE_LABELS[printSize as PrintSize]}`
        : "";
    const typeLabel =
      purchaseType === "print"
        ? "Fine Art Print"
        : "Fine Art Print";

    const productName =
      purchaseType === "original"
        ? `${artwork.title} — Original`
        : `${artwork.title} — ${typeLabel}${sizeLabel}`;
    const description =
      purchaseType === "original"
        ? `Original artwork by Ryan Cellar${artwork.medium ? ` · ${artwork.medium}` : ""}${artwork.dimensions ? ` · ${artwork.dimensions}` : ""}`
        : `Fine art ${typeLabel.toLowerCase()} by Ryan Cellar — archival quality`;

    const metadata: Record<string, string> = {
      artworkSlug: artwork.slug,
      artworkId: String(artwork.id),
      purchaseType,
      artworkTitle: artwork.title,
    };

    if (purchaseType === "print") {
      if (printType) metadata.printType = printType;
      if (printSize) metadata.printSize = printSize;
      if (printifyProductId) metadata.printifyProductId = printifyProductId;
      if (printifyVariantId)
        metadata.printifyVariantId = String(printifyVariantId);
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
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
      metadata,
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    if (purchaseType === "print") {
      // Fine Art Print: blueprint 804, provider 72 (Print Clever)
      const printShippingRates = await getBlueprintShippingRates(804, 72);
      sessionParams.shipping_options = buildStripeShippingOptions(printShippingRates);
      sessionParams.phone_number_collection = { enabled: true };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.json(
      CreateCheckoutSessionResponse.parse({
        url: session.url,
        sessionId: session.id,
      })
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" });
    }
    console.error(
      "createCheckoutSession error:",
      err instanceof Error ? err.message : String(err)
    );
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/checkout/verify — read-only order status polling ───────────────
router.post("/checkout/verify", async (req, res) => {
  try {
    const { sessionId } = VerifyCheckoutBody.parse(req.body);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.stripeSessionId, sessionId))
      .limit(1);

    if (order) {
      const [artwork] = await db
        .select({ title: artworksTable.title })
        .from(artworksTable)
        .where(eq(artworksTable.id, order.artworkId))
        .limit(1);

      res.json(
        VerifyCheckoutResponse.parse({
          success: true,
          purchaseType: order.type,
          artworkTitle: artwork?.title ?? "Your artwork",
          message: successMessage(
            order.type as "original" | "print",
            order.status
          ),
        })
      );
      return;
    }

    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Payment processing not configured" });
      return;
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      res.status(400).json({ error: "Payment not completed" });
      return;
    }

    const meta = session.metadata as {
      purchaseType: "original" | "print";
      artworkTitle: string;
    };

    return res.json(
      VerifyCheckoutResponse.parse({
        success: true,
        purchaseType: meta.purchaseType,
        artworkTitle: meta.artworkTitle,
        message: successMessage(meta.purchaseType, "processing"),
      })
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" });
    }
    console.error(
      "verifyCheckout error:",
      err instanceof Error ? err.message : String(err)
    );
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
