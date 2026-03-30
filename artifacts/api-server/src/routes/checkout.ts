import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, artworksTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateCheckoutSessionBody,
  CreateCheckoutSessionResponse,
  VerifyCheckoutBody,
  VerifyCheckoutResponse,
} from "@workspace/api-zod";
import { sendOrderNotification } from "../lib/mailer";
import { createPrintOrder } from "../lib/printify";

const router: IRouter = Router();

const PRINT_PRICE_CENTS = 4500; // $45
const TERMINAL_STATUSES = ["paid", "fulfilled", "failed"] as const;
type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

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

  // Upsert order row
  if (!existing) {
    await db.insert(ordersTable).values({
      artworkId: parseInt(artworkId, 10),
      type: purchaseType,
      stripeSessionId: sessionId,
      status: "paid",
      customerEmail: session.customer_details?.email ?? null,
    });
  } else {
    await db
      .update(ordersTable)
      .set({ status: "paid" })
      .where(eq(ordersTable.stripeSessionId, sessionId));
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
    // In Stripe SDK v21+, shipping details are under collected_information.shipping_details
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

    const nameParts = customerName.split(" ");
    const firstName = nameParts[0] ?? "Customer";
    const lastName = nameParts.slice(1).join(" ") || "Buyer";

    createPrintOrder({
      artworkTitle,
      artworkImageUrl: "",
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
          .set({
            printifyOrderId: printifyOrderId ?? null,
            status: "fulfilled",
          })
          .where(eq(ordersTable.stripeSessionId, sessionId));
        console.log(
          printifyOrderId
            ? `Print order fulfilled via Printify: ${printifyOrderId}`
            : `Print order marked fulfilled (Printify not configured — artist notified)`
        );
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
// Must be registered with express.raw({ type: 'application/json' }) in app.ts
// BEFORE the global express.json() middleware so the raw body is preserved.
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
      try {
        await fulfillOrder(session);
      } catch (err) {
        console.error(
          "fulfillOrder error in webhook:",
          err instanceof Error ? err.message : String(err)
        );
        // Still return 200 to Stripe so it doesn't retry indefinitely for non-transient errors
      }
    }
  }

  res.json({ received: true });
}

// ── POST /api/checkout/session — create a Stripe checkout session ─────────────
router.post("/checkout/session", async (req, res) => {
  try {
    const body = CreateCheckoutSessionBody.parse(req.body);
    const { artworkSlug, purchaseType, customerEmail, successUrl, cancelUrl } =
      body;

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

    const unitAmount =
      purchaseType === "original" ? artwork.price! : PRINT_PRICE_CENTS;
    const productName =
      purchaseType === "original"
        ? `${artwork.title} — Original`
        : `${artwork.title} — Fine Art Print`;
    const description =
      purchaseType === "original"
        ? `Original artwork by Ryan Cellar${artwork.medium ? ` · ${artwork.medium}` : ""}${artwork.dimensions ? ` · ${artwork.dimensions}` : ""}`
        : `Fine art giclee print by Ryan Cellar — archival quality`;

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
      metadata: {
        artworkSlug: artwork.slug,
        artworkId: String(artwork.id),
        purchaseType,
        artworkTitle: artwork.title,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    // For prints, collect shipping address via Stripe Checkout
    if (purchaseType === "print") {
      sessionParams.shipping_address_collection = {
        allowed_countries: [
          "US", "CA", "GB", "AU", "DE", "FR", "NL", "SE", "NO", "DK",
          "FI", "BE", "AT", "CH", "IE", "NZ", "SG", "JP",
        ],
      };
      sessionParams.phone_number_collection = { enabled: true };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json(
      CreateCheckoutSessionResponse.parse({
        url: session.url,
        sessionId: session.id,
      })
    );
  } catch (err) {
    console.error(
      "createCheckoutSession error:",
      err instanceof Error ? err.message : String(err)
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/checkout/verify — read-only order status polling ───────────────
// Safe to call repeatedly. No fulfillment side effects — those are handled by
// the Stripe webhook. Returns the latest order status from the database, falling
// back to a Stripe session check when the webhook hasn't fired yet.
router.post("/checkout/verify", async (req, res) => {
  try {
    const { sessionId } = VerifyCheckoutBody.parse(req.body);

    // Check DB for existing order record (webhook may have already processed it)
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

    // Order not yet in DB — check Stripe to confirm payment was completed
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

    // Payment confirmed by Stripe but webhook hasn't fired yet
    // Return an optimistic success — webhook will complete fulfillment server-side
    const meta = session.metadata as {
      purchaseType: "original" | "print";
      artworkTitle: string;
    };

    res.json(
      VerifyCheckoutResponse.parse({
        success: true,
        purchaseType: meta.purchaseType,
        artworkTitle: meta.artworkTitle,
        message: successMessage(meta.purchaseType, "processing"),
      })
    );
  } catch (err) {
    console.error(
      "verifyCheckout error:",
      err instanceof Error ? err.message : String(err)
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
